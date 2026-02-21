# @currentjs/templating

*"Because sometimes you just want to write HTML like it's 2005, but with the conveniences of 2025"*

## What is this?

A lightweight server-side HTML templating engine that's desperately trying to justify its existence in a world dominated by React, Vue, and other modern frontend frameworks. Think of it as Mustache's quirky cousin who learned some new tricks but still insists on living in the server-side basement.

## Why Not Just Use React?

Excellent question! Here are some totally legitimate reasons:

1. **You enjoy the thrill of server-side rendering** without the complexity of Next.js
2. **You miss the simplicity of PHP templates** but want to stay in the JavaScript ecosystem
3. **You're building a generated application** where the templating needs to be dead simple and predictable
4. **You want to feel nostalgic** about the good old days when templates were just HTML with some mustaches
5. **You're secretly a masochist** who enjoys debugging template syntax errors

In all seriousness, this templating engine shines when you need:
- Simple, readable templates that designers can understand
- Server-side rendering without the React SSR complexity
- Generated code that doesn't require a PhD in modern JavaScript frameworks
- Templates that don't change much and don't need state management

## Core Features

### 🔧 Mustache-style Interpolation
```html
<h1>Hello, {{ name }}!</h1>
<p>You are {{ age }} years old.</p>
```

Values are **HTML-escaped** by default (`&`, `"`, `'`, `<`, `>` → entities). Use triple braces `{{{ }}}` for raw (unescaped) output—e.g. when injecting pre-rendered HTML like layout content.

### 🔄 Loops with x-for
```html
<ul x-for="items" x-row="item">
  <li>{{ item.name }} - ${{ item.price }}</li>
</ul>
```

### ❓ Conditionals with x-if
```html
<div x-if="user.isAdmin">
  <button>Delete Everything</button>
</div>
```

### 📝 Template Includes
```html
<!-- Define a template -->
<!-- @template name="userCard" -->
<div class="card">
  <h3>{{ name }}</h3>
  <p>{{ email }}</p>
</div>

<!-- Use it elsewhere -->
<userCard name="John" email="john@example.com" />
```

### 🎭 Layout Support
```html
<!-- layout.html -->
<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>{{ content }}</body>
</html>

<!-- Use with layout -->
engine.renderWithLayout('layout', 'myPage', { title: 'My Page' });
```

## Real-World Usage (From Generated Apps)

When you use the `@currentjs/gen` package to generate an application, it automatically sets up the templating engine for you. Here's how it looks in practice:

### Main Application Setup
```typescript
// Generated in app.ts
import { createTemplateEngine } from '@currentjs/templating';

const renderEngine = createTemplateEngine({ 
  directories: [process.cwd()] 
});

const app = createWebServer({ controllers, webDir }, { 
  port: 3000, 
  renderer: (template, data, layout) => {
    try {
      return layout 
        ? renderEngine.renderWithLayout(layout, template, data) 
        : renderEngine.render(template, data);
    } catch (e) {
      return String(e instanceof Error ? e.message : e);
    }
  },
  errorTemplate: 'error'
});
```

### Layout Template Example
```html
<!-- src/common/ui/templates/main_view.html -->
<!-- @template name="main_view" -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your App</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="/app.js"></script>
</head>
<body>
  <div class="container-fluid">
    <div id="main">{{{ content }}}</div>
  </div>
</body>
</html>
```

### Data List Template
```html
<!-- src/modules/Cat/views/catlist.html -->
<!-- @template name="catList" -->
<div class="container-fluid py-4">
  <div class="row">
    <div class="col">
      <h1 class="h2">Cat List</h1>
      <table class="table table-hover">
        <thead>
          <tr>
            <th>ID</th><th>Name</th><th>Age</th><th>Breed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody x-for="$root" x-row="row">
          <tr>
            <td>{{ row.id }}</td>
            <td>{{ row.name }}</td>
            <td>{{ row.age }}</td>
            <td>{{ row.breed }}</td>
            <td>
              <a href="/cat/{{ row.id }}" class="btn btn-sm btn-outline-primary">View</a>
              <a href="/cat/{{ row.id }}/edit" class="btn btn-sm btn-outline-secondary">Edit</a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
```

### Detail View Template
```html
<!-- src/modules/Cat/views/catdetail.html -->
<!-- @template name="catDetail" -->
<div class="container-fluid py-4">
  <div class="row justify-content-center">
    <div class="col-lg-8">
      <h1 class="h2">Cat Details</h1>
      <div class="card">
        <div class="card-body">
          <table class="table table-borderless">
            <tbody>
              <tr><th>Name</th><td>{{ $root.name }}</td></tr>
              <tr><th>Age</th><td>{{ $root.age }}</td></tr>
              <tr><th>Breed</th><td>{{ $root.breed }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <a href="{{ basePath }}/{{ $root.id }}/edit" class="btn btn-primary">Edit</a>
    </div>
  </div>
</div>
```

## API Reference

### TemplateEngine Class

#### Constructor Options
```typescript
type TemplateEngineOptions = {
  directories: string[];           // Where to look for templates
  extensions?: string[];           // File extensions to scan (default: ['.html', '.htm', '.tpl', '.tpl.html'])
  nameDirectiveRegex?: RegExp;     // Custom regex for template name directives
  caseInsensitiveNames?: boolean;  // Case-insensitive template names (default: true)
};
```

#### Methods

**`render(templateName: string, data: unknown): string`**
Renders a template with the given data.

**`renderWithLayout(layoutTemplateName: string, innerTemplateName: string, data: unknown, contentVarName?: string): string`**
Renders a template inside a layout. The inner template is rendered first, then injected into the layout as the content variable.

**`reload(): void`**
Rescans all directories for templates. Useful during development.

**`listTemplateNames(): string[]`**
Returns all available template names.

### Template Syntax

#### Template Names
Templates are identified by a directive at the top of the file:
```html
<!-- @template name="myTemplate" -->
<!-- or -->
<!-- @template: myTemplateName -->
```

If no directive is found, the filename (without extension) is used.

#### Variable Interpolation
```html
{{ variableName }}
{{ object.property }}
{{ $root.someProperty }}  <!-- Access root data object -->
{{ $index }}              <!-- Current loop index (inside x-for) -->
```

- **`{{ }}`** — Escaped output: characters `&`, `"`, `'`, `<`, `>` are converted to HTML entities. Use for text and attribute values to prevent broken markup and XSS when data contains quotes (e.g. JSON strings).
- **`{{{ }}}`** — Raw (unescaped) output: use only for trusted HTML you intend to inject as markup (e.g. `{{{ content }}}` in layouts for pre-rendered inner templates).

#### Loops
```html
<div x-for="arrayVariable" x-row="itemName">
  <p>{{ itemName.property }}</p>
  <span>Index: {{ $index }}</span>
</div>
```

- `x-for` specifies the array to iterate over
- `x-row` specifies the variable name for each item (defaults to "item")
- `$index` is available inside loops

#### Conditionals
```html
<div x-if="user.isActive">
  <p>User is active!</p>
</div>

<section x-if="items.length > 0">
  <h2>Items Found</h2>
</section>
```

#### Template Includes
```html
<!-- Self-closing tag with template name -->
<myTemplate prop1="value" prop2="{{ dynamicValue }}" />

<!-- Attributes can be static strings or dynamic expressions -->
<userCard 
  name="{{ user.fullName }}" 
  role="admin" 
  isActive="{{ user.status === 'active' }}" 
/>
```

## Security Considerations

⚠️ **Important**: This templating engine uses `eval()` for expression evaluation (wrapped in a `Function` constructor with a limited scope). While it's sandboxed to some degree, **never use untrusted user input directly in templates**. This is designed for server-side templates with controlled data, not for rendering user-generated content.

By default, `{{ }}` interpolations are HTML-escaped, which helps prevent broken attributes and XSS when values contain quotes or special characters. Use `{{{ }}}` only for trusted pre-rendered HTML (e.g. layout content).

## Performance Notes

- Templates are cached after the first scan
- Use `reload()` in development, but avoid it in production
- The engine is designed for server-side rendering, not real-time updates
- Nested includes can impact performance (there's a 50-level recursion limit)

## Debugging Tips

1. **Template not found?** Check your template name directive and file location
2. **Expression errors?** The engine will throw with context about which expression failed
3. **Infinite recursion?** Check for circular includes between templates
4. **Variables undefined?** Remember that `{{ undefinedVar }}` renders as empty string
5. **x-for not working?** Make sure your data is actually an array

## Common Patterns

### Master-Detail Views
```typescript
// Controller
return this.render('catDetail', cat, 'main_view');
```

### Form with Validation Errors
```html
<div x-if="errors.name">
  <span class="error">{{ errors.name }}</span>
</div>
<input type="text" name="name" value="{{ formData.name || '' }}">
```

### Dynamic Navigation
```html
<nav>
  <ul x-for="menuItems" x-row="item">
    <li x-if="item.visible">
      <a href="{{ item.url }}" x-if="item.url === currentPath" class="active">
        {{ item.title }}
      </a>
    </li>
  </ul>
</nav>
```

## Comparison with Other Solutions

| Feature | @currentjs/templating | Mustache | Handlebars | JSX/React |
|---------|----------------------|----------|------------|-----------|
| Learning Curve | Low | Low | Medium | High |
| Logic in Templates | Limited | None | Some | Full JavaScript |
| Server-Side Only | ✅ | ✅ | ✅ | ❌ (needs SSR setup) |
| Template Inheritance | ✅ | ❌ | ✅ | ❌ (component-based) |
| Performance | Good | Excellent | Good | Excellent (client-side) |
| Bundle Size | Small | Tiny | Medium | Large |
| Ecosystem | Minimal | Large | Large | Massive |

## When to Use This vs. Modern Frameworks

**Use @currentjs/templating when:**
- Building traditional server-rendered applications
- Working with generated/scaffolded code
- Need simple templates that non-developers can edit
- Want minimal build complexity
- Building content-heavy sites with minimal interactivity

**Use React/Vue/etc. when:**
- Building interactive SPAs
- Need complex state management
- Want rich ecosystem and tooling
- Building apps with real-time updates
- Team is comfortable with modern JavaScript

## Installation & Setup

*As promised, here's the boring installation stuff at the bottom:*

### 🚀 Using with @currentjs/gen (Code Generator)

**You don't need to install anything** When you generate an application using `@currentjs/gen`, this templating package is automatically installed and configured for you. Just start creating your `.html` templates and you're ready to go.

```bash
# Generate your app - templating is included automatically
currentjs create app my-app
# Start creating templates in src/modules/YourModule/views/
```
(for more details see the [documentation](https://github.com/currentjs/gen))

### 📦 Manual Installation (Standalone Usage)

Only needed if you want to use this templating engine outside of generated applications:

```bash
npm install @currentjs/templating
```

### Basic Setup
```typescript
import { createTemplateEngine } from '@currentjs/templating';

const engine = createTemplateEngine({
  directories: ['./views', './templates'],
  extensions: ['.html', '.tpl']  // optional
});

// Render a template
const html = engine.render('myTemplate', { 
  title: 'Hello World',
  users: [{ name: 'Alice' }, { name: 'Bob' }]
});

// Render with layout
const htmlWithLayout = engine.renderWithLayout(
  'layout',      // layout template name
  'content',     // inner template name  
  { title: 'My Page' },
  'content'      // variable name in layout (default: 'content')
);
```

### Integration with Express.js
```typescript
import express from 'express';
import { createTemplateEngine } from '@currentjs/templating';

const app = express();
const engine = createTemplateEngine({ directories: ['./views'] });

app.get('/', (req, res) => {
  const html = engine.render('home', { message: 'Hello World!' });
  res.send(html);
});
```

---

*Remember: This templating engine is like a reliable old car - it might not have all the bells and whistles of a Tesla, but it'll get you where you need to go without breaking down. And sometimes, that's exactly what you need.*

## Authorship & contribution
Vibecoded with `claude-4-sonnet` & `gpt-5` by Konstantin Zavalny. Yes, it is a vibecoded solution, really.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
 - can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
 - can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.