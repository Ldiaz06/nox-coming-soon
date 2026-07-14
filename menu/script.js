(() => {
  'use strict';

  const content = document.getElementById('menu-content');
  const sectionTemplate = document.getElementById('section-template');
  const itemTemplate = document.getElementById('item-template');

  const renderMenu = (menu) => {
    const fragment = document.createDocumentFragment();
    document.getElementById('eyebrow').textContent = menu.eyebrow;
    document.getElementById('tagline').textContent = menu.tagline;
    document.getElementById('location').textContent = menu.location;

    menu.sections.forEach((section) => {
      const sectionNode = sectionTemplate.content.cloneNode(true);
      const sectionElement = sectionNode.querySelector('.menu-section');
      const itemsElement = sectionNode.querySelector('.items');
      sectionElement.id = section.id;
      sectionNode.querySelector('h2').textContent = section.title;

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
        price.value = item.price;
        price.textContent = item.price;
        price.setAttribute('aria-label', `${item.price} dólares`);

        const description = itemNode.querySelector('.description');
        if (item.description) description.textContent = item.description;
        else description.remove();
        itemsElement.append(itemNode);
      });

      fragment.append(sectionNode);
    });

    content.replaceChildren(fragment);
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
