(() => {
  'use strict';
  const modules = [
    'core',
    'auth-data',
    'inventory',
    'sales-ui',
    'finance',
    'exports',
    'mutations',
    'events'
  ];
  const base = new URL('./scripts/', document.currentScript.src);
  (async () => {
    for (const module of modules) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL(module + '.js?v=modules-20261020-1', base);
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Não foi possível carregar ' + module));
        document.body.appendChild(script);
      });
    }
  })().catch(error => {
    console.error('Falha ao inicializar a aplicação:', error);
    const box = document.getElementById('loginMessage');
    if (box) {
      box.textContent = 'Não foi possível carregar o sistema. Atualize a página.';
      box.classList.remove('d-none');
    }
  });
})();
