/* RED DWARFS job worker: one fresh machine per run. */
importScripts('engine/reddwarf.js');

let batch = [], timer = null;
function flush() {
  if (batch.length) { postMessage({ type: 'lines', lines: batch }); batch = []; }
  timer = null;
}
function pushLine(s) {
  batch.push(s);
  if (!timer) timer = setTimeout(flush, 40);
}

onmessage = async (ev) => {
  if (ev.data.type !== 'run') return;
  const deck = ev.data.deck;
  const input = Array.from(deck, c => c.charCodeAt(0));
  let ipos = 0;
  const t0 = Date.now();
  try {
    await RedDwarfModule({
      locateFile: (p) => 'engine/' + p,
      stdin: () => (ipos < input.length ? input[ipos++] : null),
      print: pushLine,
      printErr: () => {},
    });
    flush();
    postMessage({ type: 'done', ms: Date.now() - t0 });
  } catch (e) {
    flush();
    postMessage({ type: 'error', message: String(e) });
  }
};
