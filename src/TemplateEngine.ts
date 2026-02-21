import * as fs from 'fs';
import * as path from 'path';

export type TemplateEngineOptions = {
  directories: string[];
  extensions?: string[];
  nameDirectiveRegex?: RegExp;
  caseInsensitiveNames?: boolean;
};

type TemplateRecord = {
  name: string;
  filePath: string;
  content: string;
};

const DEFAULT_NAME_DIRECTIVE = /<!--\s*@template(?:\s+name\s*=\s*"([^"]+)"|[:\s]+([^\-\->]+))\s*-->/i;

export class TemplateEngine {
  private readonly directories: string[];
  private readonly extensions: string[];
  private readonly nameDirective: RegExp;
  private readonly caseInsensitiveNames: boolean;
  private readonly templateNameToRecord: Map<string, TemplateRecord> = new Map();

  constructor(options: TemplateEngineOptions) {
    if (!options || !options.directories || options.directories.length === 0) {
      throw new Error('TemplateEngine requires at least one directory to scan.');
    }
    this.directories = options.directories.map((d) => path.resolve(d));
    this.extensions = options.extensions ?? ['.html', '.htm', '.tpl', '.tpl.html'];
    this.caseInsensitiveNames = options.caseInsensitiveNames ?? true;
    this.nameDirective = options.nameDirectiveRegex ?? DEFAULT_NAME_DIRECTIVE;
  }

  public reload(): void {
    this.templateNameToRecord.clear();
    for (const directory of this.directories) {
      this.scanDirectory(directory);
    }
  }

  public listTemplateNames(): string[] {
    return Array.from(this.templateNameToRecord.keys()).sort();
  }

  private normalizeName(name: string): string {
    return this.caseInsensitiveNames ? name.trim().toLowerCase() : name.trim();
  }

  private scanDirectory(directory: string): void {
    if (!fs.existsSync(directory)) {
      return;
    }
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        this.scanDirectory(fullPath);
        continue;
      }
      if (!this.extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        continue;
      }
      const raw = fs.readFileSync(fullPath, 'utf8');
      const name = this.extractTemplateName(raw) ?? path.basename(entry.name, path.extname(entry.name));
      const normalizedName = this.normalizeName(name);
      const record: TemplateRecord = { name: normalizedName, filePath: fullPath, content: raw };
      this.templateNameToRecord.set(normalizedName, record);
    }
  }

  private extractTemplateName(content: string): string | null {
    const match = content.match(this.nameDirective);
    if (!match) return null;
    const name = (match[1] ?? match[2] ?? '').trim();
    return name.length > 0 ? name : null;
  }

  /**
   * Renders a template with the given data.
   * @param templateName - The name of the template to render.
   * @param data - The data to render the template with.
   * @returns The rendered template.
   */
  public render(templateName: string, data: unknown): string {
    const normalizedName = this.normalizeName(templateName);
    const record = this.templateNameToRecord.get(normalizedName);
    if (!record) {
      throw new Error(`Template not found: ${templateName}`);
    }
    const renderStack: string[] = [];
    return this.renderContent(record.content, this.createRootDataProxy(data), renderStack);
  }

  /**
   * Renders a template inside of a layout (global) template.
   *
   * The inner template is rendered first with the provided data. The resulting
   * HTML string is then injected into the layout template as a variable with
   * the name defined by contentVarName (default: "content"). The layout
   * template is rendered after merging the original data plus that content
   * variable.
   */
  public renderWithLayout(
    layoutTemplateName: string,
    innerTemplateName: string,
    data: unknown,
    contentVarName: string = 'content',
  ): string {
    const innerHtml = this.render(innerTemplateName, data);
    const layoutData = { ...(data as any), [contentVarName]: innerHtml };
    return this.render(layoutTemplateName, layoutData);
  }

  private createRootDataProxy<T extends unknown>(data: T): any {
    const context = Object.create(null);
    (context as any).$root = data as any;
    if (data && typeof data === 'object') {
      Object.assign(context, data as any);
    }
    return context;
  }

  private createEvalScope(data: any): any {
    const target = data ?? {};
    const handler: ProxyHandler<any> = {
      // Pretend every identifier exists to avoid ReferenceError in `with`
      has: () => true,
      get: (t, p) => {
        if (p === Symbol.unscopables) return undefined as any;
        if (p in t) return (t as any)[p as any];
        if (p in (globalThis as any)) return (globalThis as any)[p as any];
        return undefined as any;
      },
    };
    return new Proxy(target, handler);
  }

  private renderContent(source: string, data: any, renderStack: string[], depth: number = 0): string {
    if (depth > 50) {
      throw new Error('Template render depth exceeded. Potential infinite recursion.');
    }

    let html = source;

    // Remove BOM if present
    if (html.charCodeAt(0) === 0xfeff) {
      html = html.slice(1);
    }

    // 1) Expand loops
    html = this.applyLoops(html, data, renderStack, depth);

    // 2) Apply conditionals
    html = this.applyConditionals(html, data, renderStack, depth);

    // 3) Resolve includes (self-closing tags named as templates)
    html = this.applyIncludes(html, data, renderStack, depth);

    // 4) Interpolate expressions
    html = this.interpolate(html, data);

    return html;
  }

  private applyIncludes(html: string, data: any, renderStack: string[], depth: number): string {
    const includeTagRegex = /<([A-Za-z][\w\-]*)\s*([^>]*)\/>/g; // self-closing only
    let didReplace = false;
    const result = html.replace(includeTagRegex, (full, tagName: string, attrs: string) => {
      const normalized = this.normalizeName(tagName);
      if (!this.templateNameToRecord.has(normalized)) {
        return full; // not an include tag
      }
      didReplace = true;
      const attributes = this.parseAttributes(attrs, data);
      // Guard recursion
      if (renderStack.includes(normalized)) {
        throw new Error(`Cyclic include detected: ${[...renderStack, normalized].join(' -> ')}`);
      }
      const record = this.templateNameToRecord.get(normalized)!;
      const mergedData = { ...data, ...attributes };
      const rendered = this.renderContent(record.content, mergedData, [...renderStack, normalized], depth + 1);
      return rendered;
    });
    if (didReplace) {
      // Resolve nested includes created by replacements
      return this.applyIncludes(result, data, renderStack, depth + 1);
    }
    return result;
  }

  private applyConditionals(html: string, data: any, renderStack: string[], depth: number): string {
    // Matches an element with x-if=\"expr\" attribute
    const ifRegex = /<([A-Za-z][\w\-]*)\b([^>]*)\bx-if=\"([^\"]+)\"([^>]*)>([\s\S]*?)<\/\1>/g;
    let didReplace = false;
    const result = html.replace(ifRegex, (full, tagName: string, preAttrs: string, expr: string, postAttrs: string, inner: string) => {
      const attrsCombined = `${preAttrs} ${postAttrs}`.trim();
      const condition = this.safeEvalBoolean(expr, data);
      if (!condition) {
        didReplace = true;
        return '';
      }
      didReplace = true;
      // Remove x-if attribute
      const cleanedAttrs = attrsCombined.replace(/\bx-if=\"[^\"]+\"/g, '').replace(/\s{2,}/g, ' ').trim();
      const openTag = cleanedAttrs.length > 0 ? `<${tagName} ${cleanedAttrs}>` : `<${tagName}>`;
      const processedInner = this.renderContent(inner, data, renderStack, depth + 1);
      return `${openTag}${processedInner}</${tagName}>`;
    });
    if (didReplace) {
      return this.applyConditionals(result, data, renderStack, depth + 1);
    }
    return result;
  }

  private applyLoops(html: string, data: any, renderStack: string[], depth: number): string {
    // Matches element with x-for and optional x-row alias
    const forRegex = /<([A-Za-z][\w\-]*)\b([^>]*)\bx-for=\"([^\"]+)\"([^>]*)>([\s\S]*?)<\/\1>/g;
    let didReplace = false;
    const result = html.replace(forRegex, (full, tagName: string, preAttrs: string, expr: string, postAttrs: string, inner: string) => {
      const attrsCombined = `${preAttrs} ${postAttrs}`.trim();
      const aliasMatch = attrsCombined.match(/\bx-row=\"([^\"]+)\"/);
      const alias = aliasMatch ? aliasMatch[1].trim() : 'item';
      const iterable = this.safeEval(expr, data);
      if (!Array.isArray(iterable)) {
        // If not array, remove the whole block
        didReplace = true;
        return '';
      }
      didReplace = true;
      // Remove x-for and x-row attributes for output
      const cleanedAttrs = attrsCombined
        .replace(/\bx-for=\"[^\"]+\"/g, '')
        .replace(/\bx-row=\"[^\"]+\"/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const openTag = cleanedAttrs.length > 0 ? `<${tagName} ${cleanedAttrs}>` : `<${tagName}>`;
      const closingTag = `</${tagName}>`;
      const pieces: string[] = [];
      for (let index = 0; index < iterable.length; index += 1) {
        const row = iterable[index];
        const childData = { ...data, [alias]: row, $index: index };
        const processedInner = this.renderContent(inner, childData, renderStack, depth + 1);
        pieces.push(`${openTag}${processedInner}${closingTag}`);
      }
      return pieces.join('');
    });
    if (didReplace) {
      return this.applyLoops(result, data, renderStack, depth + 1);
    }
    return result;
  }

  private interpolate(html: string, data: any): string {
    // First pass: raw (unescaped) triple-brace expressions {{{ expr }}}
    html = html.replace(/\{\{\{\s*([^}]+?)\s*\}\}\}/g, (_full, expr: string) => {
      const value = this.safeEval(expr, data);
      if (value === null || value === undefined) return '';
      return String(value);
    });
    // Second pass: escaped double-brace expressions {{ expr }}
    const mustacheRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
    return html.replace(mustacheRegex, (_full, expr: string) => {
      const value = this.safeEval(expr, data);
      if (value === null || value === undefined) return '';
      return this.escapeHtml(String(value));
    });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private parseAttributes(attrs: string, data: any): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const attrRegex = /(\w[\w\-]*)\s*=\s*"([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(attrs)) !== null) {
      const key = match[1];
      const rawValue = match[2];
      const exprMatch = rawValue.match(/^\{\{\s*([\s\S]+?)\s*\}\}$/);
      if (exprMatch) {
        result[key] = this.safeEval(exprMatch[1], data);
      } else {
        result[key] = rawValue;
      }
    }
    return result;
  }

  private safeEvalBoolean(expression: string, data: any): boolean {
    const result = this.safeEval(expression, data);
    return Boolean(result);
  }

  // Very small sandbox using Function + with(data)
  private safeEval(expression: string, data: any): any {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('scope', `with (scope) { return ( ${expression} ); }`);
      const scope = this.createEvalScope(data);
      return fn(scope);
    } catch (error) {
      // On evaluation error, rethrow with context
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Expression evaluation failed for "${expression}": ${message}`);
    }
  }
}

export function createTemplateEngine(options: TemplateEngineOptions): TemplateEngine {
  const engine = new TemplateEngine(options);
  engine.reload();
  return engine;
}

export default TemplateEngine;

