/**
 * Preserve Zod 3 input behavior in json-schema-to-zod output.
 * Edit call expressions only, leaving descriptions and literal defaults intact.
 * @param {string} code
 * @param {typeof import('typescript')} ts Compiler supplied by the caller's install.
 * @returns {string}
 */
function toZod4Code(code, ts) {
  const source = ts.createSourceFile('schema.ts', code, ts.ScriptTarget.Latest, true);
  /** @type {{ start: number, end: number, text: string }[]} */
  const edits = [];
  /** @param {import('typescript').Node} node */
  const isStringCall = node => ts.isCallExpression(node) && node.arguments.length === 0
    && ts.isPropertyAccessExpression(node.expression)
    && node.expression.expression.getText(source) === 'z'
    && node.expression.name.text === 'string';

  /** @param {import('typescript').Node} node */
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const property = node.expression;
      if (property.name.text === 'default') {
        edits.push({ start: property.name.getStart(source), end: property.name.end, text: 'prefault' });
      } else if (property.name.text === 'uuid' && isStringCall(property.expression)) {
        edits.push({ start: property.getStart(source), end: property.end, text: 'z.guid' });
      } else if (property.name.text === 'ip' && isStringCall(property.expression)) {
        const options = node.arguments[0];
        if (node.arguments.length !== 1 || !ts.isObjectLiteralExpression(options)) {
          throw new Error('Unsupported string format "ip"; use ipv4 or ipv6');
        }
        let version;
        let message = '';
        for (const option of options.properties) {
          if (!ts.isPropertyAssignment(option)) throw new Error('Unsupported ip options');
          const key = option.name.getText(source).replace(/^['"]|['"]$/g, '');
          if (key === 'version' && ts.isStringLiteral(option.initializer)) version = option.initializer.text;
          else if (key === 'message' && ts.isStringLiteral(option.initializer)) message = option.initializer.getText(source);
          else throw new Error('Unsupported ip options');
        }
        if (version !== 'v4' && version !== 'v6') {
          throw new Error('Unsupported string format "ip"; use ipv4 or ipv6');
        }
        edits.push({ start: node.getStart(source), end: node.end, text: `z.ip${version}(${message})` });
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }
  return code;
}

module.exports = { toZod4Code };
