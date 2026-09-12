// A host's simulation clock must not depend on requestAnimationFrame visibility.
setInterval(()=>postMessage('tick'),1000/60);
