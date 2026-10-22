document.addEventListener('DOMContentLoaded', () => {
  const bindAction = (id, fn) => {
    const el = getById(id);
    if (el && typeof fn === 'function') {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        fn();
      });
    }
  };

  bindAction('wn_open_tracker', openAddon);
  bindAction('wn_open_options', openAddonOptions);
});
