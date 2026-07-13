const screens = [...document.querySelectorAll('[data-screen]')];

function showScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelector('[data-action="start"]').addEventListener('click', () => {
  showScreen('categories');
});

document.querySelectorAll('[data-category]').forEach((button) => {
  button.addEventListener('click', () => {
    const category = button.dataset.category;
    if (category === 'ornaments') {
      showScreen('ornaments');
      return;
    }
    alert('This category is scheduled after the ornament ordering flow is complete.');
  });
});

document.querySelectorAll('[data-action="back-categories"]').forEach((button) => {
  button.addEventListener('click', () => showScreen('categories'));
});

document.querySelectorAll('[data-product]').forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.querySelector('h3')?.textContent ?? 'Product';
    alert(`${name} customization is the next development step.`);
  });
});

document.querySelector('[data-action="staff"]').addEventListener('click', () => {
  alert('Staff workspace will be added behind a PIN in the next staff sprint.');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
