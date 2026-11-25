// explain.js — one short, simple English sentence for each step.

function val(v) {
  if (!v) return '';
  switch (v.kind) {
    case 'string': return `"${v.text}"`;
    case 'null': return 'null (nothing)';
    case 'object': return `the ${v.cls} house #${v.id}`;
    case 'array': return `the ${v.type} array #${v.id}`;
    case 'prim': return v.type === 'char' ? `'${v.text}'` : v.text;
    default: return '';
  }
}

export function explainStep(step, prevStep) {
  const lines = [];
  for (const e of step.events) {
    switch (e.type) {
      case 'start': lines.push(`The program starts in ${e.main}.main().`); break;
      case 'classInit': lines.push(`First use of ${e.cls}: Java prepares its static parts (shared by all objects).`); break;
      case 'new': lines.push(`new ${e.cls}(...): a new house is built from the ${e.cls} blueprint (id=${e.id}).`); break;
      case 'newArray': lines.push(`A new array is created: ${e.length} boxes of ${e.elemType}, all empty at first.`); break;
      case 'call':
        if (e.method === '<init>') lines.push(`The constructor of ${e.cls} runs: it fills the baskets of house #${e.thisId}.`);
        else if (e.static) lines.push(`Call ${e.cls}.${e.method}() on the class itself (static, no object needed).`);
        else lines.push(`Go to house #${e.thisId} and call ${e.method}().`);
        break;
      case 'autoToString': lines.push(`println needs text, so Java calls toString() on house #${e.id} by itself.`); break;
      case 'return':
        if (e.method !== '<init>' && e.value) lines.push(`${e.method}() gives back ${val(e.value)}.`);
        break;
      case 'fieldSet': lines.push(`The basket "${e.field}" of house #${e.id} now holds ${val(e.value)}.`); break;
      case 'staticSet': lines.push(`The shared (static) basket ${e.cls}.${e.field} now holds ${val(e.value)}.`); break;
      case 'varDeclare': if (e.value) lines.push(`New variable: the sign now points to ${val(e.value)}.`); break;
      case 'varSet': lines.push(`The variable ${e.name} now holds ${val(e.value)}.`); break;
      case 'arraySet': lines.push(`Box [${e.index}] of array #${e.id} now holds ${val(e.value)}.`); break;
      case 'print': lines.push(`The console prints: ${JSON.stringify(e.text.replace(/\n$/, ''))}`); break;
      case 'blocked': lines.push(`Blocked! "${e.member}" is ${e.visibility}: it cannot be used from here.`); break;
    }
  }
  if (step.final) {
    if (step.error) lines.push(step.error.hint ? step.error.hint : 'The program stopped because of an error.');
    else lines.push('The program is finished.');
  }
  if (!lines.length) {
    if (prevStep && step.depth < prevStep.depth) lines.push('Back from the method, to the line that called it.');
    else lines.push('Next line.');
  }
  return lines;
}
