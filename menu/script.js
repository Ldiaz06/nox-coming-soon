(() => {
  'use strict';

  const content = document.getElementById('menu-content');
  const switcher = document.getElementById('menu-switcher');
  const intro = document.getElementById('menu-intro');
  const sectionTemplate = document.getElementById('section-template');
  const itemTemplate = document.getElementById('item-template');

  const renderSections = (selectedMenu) => {
    const fragment = document.createDocumentFragment();
    intro.textContent = selectedMenu.intro || '';

    selectedMenu.sections.forEach((section) => {
      const sectionNode = sectionTemplate.content.cloneNode(true);
      const sectionElement = sectionNode.querySelector('.menu-section');
      const itemsElement = sectionNode.querySelector('.items');
      const serving = sectionNode.querySelector('.section-heading small');
      sectionElement.id = section.id;
      sectionNode.querySelector('h2').textContent = section.title;
      if (section.serving) serving.textContent = section.serving;
      else serving.remove();

      section.items.forEach((item) => {
        const itemNode = itemTemplate.content.cloneNode(true);
        const title = itemNode.querySelector('h3');
        title.append(document.createTextNode(item.name));
        if (item.subtitle) {
          const subtitle = document.createElement('small');
          subtitle.textContent = ` (${item.subtitle})`;
          title.append(subtitle);
        }

        const price = itemNode.querySelector('.price');
        const formattedPrice = Number.isInteger(item.price) ? String(item.price) : item.price.toFixed(2);
        price.value = item.price;
        price.textContent = formattedPrice;
        price.setAttribute('aria-label', `${formattedPrice} dólares`);

        const description = itemNode.querySelector('.description');
        if (item.description) description.textContent = item.description;
        else description.remove();
        itemsElement.append(itemNode);
      });

      fragment.append(sectionNode);
    });

    content.replaceChildren(fragment);
  };

  const renderMenu = (menu) => {
    document.getElementById('eyebrow').textContent = menu.eyebrow;
    document.getElementById('tagline').textContent = menu.tagline;
    document.getElementById('location').textContent = menu.location;

    menu.menus.forEach((menuOption, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = menuOption.label;
      button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      button.addEventListener('click', () => {
        switcher.querySelectorAll('button').forEach((item) => item.setAttribute('aria-selected', 'false'));
        button.setAttribute('aria-selected', 'true');
        renderSections(menuOption);
        history.replaceState(null, '', `#${menuOption.id}`);
      });
      switcher.append(button);
    });

    const requested = location.hash.slice(1);
    const selectedIndex = Math.max(0, menu.menus.findIndex((item) => item.id === requested));
    const buttons = switcher.querySelectorAll('button');
    buttons.forEach((button, index) => button.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false'));
    renderSections(menu.menus[selectedIndex]);
  };

  fetch('./menu.json', { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) throw new Error('Menu unavailable');
      return response.json();
    })
    .then(renderMenu)
    .catch(() => {
      content.innerHTML = '<p class="error">El menú no está disponible en este momento.</p>';
    });
})();
