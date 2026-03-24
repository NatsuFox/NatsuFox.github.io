const searchInput = document.querySelector('[data-project-search]');
const cards = Array.from(document.querySelectorAll('[data-project-card]'));
const resultCount = document.querySelector('[data-results-count]');
const filterButtons = Array.from(document.querySelectorAll('[data-filter-chip]'));
const yearNode = document.querySelector('[data-current-year]');

const normalize = (value) => String(value).trim().toLowerCase();

const updateCards = (query) => {
  const value = normalize(query);
  let visible = 0;

  cards.forEach((card) => {
    const haystack = normalize(card.dataset.search || '');
    const match = !value || haystack.includes(value);
    card.hidden = !match;
    if (match) visible += 1;
  });

  if (resultCount) {
    resultCount.textContent = String(visible);
  }
};

if (searchInput) {
  searchInput.addEventListener('input', (event) => {
    updateCards(event.target.value);
  });
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const value = button.dataset.filterChip || '';
    if (searchInput) {
      searchInput.value = value;
      searchInput.focus();
    }
    updateCards(value);
  });
});

if (yearNode) {
  yearNode.textContent = String(new Date().getFullYear());
}

updateCards(searchInput ? searchInput.value : '');
