console.log('Script loaded!');

// Move the class definition to the top
class NewsFeed {
  constructor() {
    console.log('NewsFeed constructor called');
    
    // Only proceed if we're on the news feed page
    if (!this.isNewsFeedPage()) {
      console.log('Not on news feed page, exiting constructor');
      return;
    }

    console.log('Initializing NewsFeed...'); 
    
    this.feeds = new Map();
    this.articles = [];
    this.currentFilter = 'all';
    
    // DOM Elements
    this.urlInput = document.querySelector('.newsfeed__url-input');
    this.addButton = document.querySelector('.newsfeed__add-button');
    this.filterContainer = document.querySelector('.filters__scroll');
    this.articlesContainer = document.querySelector('.newsfeed__articles');
    console.log('Articles container found:', this.articlesContainer); // Debug log

    if (!this.articlesContainer) {
      console.error('Articles container not found! Selector: .newsfeed__articles');
      return;
    }

    // Bind event listeners
    this.addButton?.addEventListener('click', () => this.addFeed());
    this.urlInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addFeed();
    });

    // Initialize with 'all' filter and make All Sources button active by default
    const allSourcesButton = document.querySelector('.filter__item');
    if (allSourcesButton) {
      allSourcesButton.classList.add('filter__item--active');
      allSourcesButton.addEventListener('click', () => this.filterArticles('all'));
    }

    // Add edit mode state
    this.isEditMode = false;
    
    // Get edit button reference instead of creating it
    this.editButton = document.querySelector('.newsfeed__edit-button');
    if (this.editButton) {
      this.editButton.addEventListener('click', () => this.toggleEditMode());
    }

    // Start initialization
    this.initialize();
  }

  isNewsFeedPage() {
    return document.querySelector('.page__newsfeed') !== null;
  }

  async initialize() {
    console.log('Starting initialization...'); // Debug log
    
    // Load saved feeds from localStorage
    const savedFeeds = JSON.parse(localStorage.getItem('rssFeeds')) || [];
    console.log('Saved feeds:', savedFeeds); // Debug log
    
    if (savedFeeds.length === 0) {
      console.log('No saved feeds found');
      return;
    }

    try {
      // First, just set up the feed entries without fetching
      for (const url of savedFeeds) {
        this.feeds.set(url, { title: url, articles: [] });
      }
      
      // Then refresh all feeds to get the latest content
      await this.refreshFeeds();
      
    } catch (error) {
      console.error('Error during initialization:', error);
    }
  }

  async refreshFeeds() {
    const feedUrls = Array.from(this.feeds.keys());
    console.log('Starting feed refresh for URLs:', feedUrls);

    try {
      // Fetch all feeds in parallel
      const refreshPromises = feedUrls.map(url => this.fetchFeed(url));
      await Promise.all(refreshPromises);
      
      console.log('All feeds refreshed, updating UI...');
      this.updateFilters();
      this.updateArticles();
      
    } catch (error) {
      console.error('Error during feed refresh:', error);
    }
  }

  async fetchFeed(url) {
    console.log(`Fetching feed from ${url}...`);
    
    try {
      // Add timestamp to URL to prevent caching
      const timestamp = new Date().getTime();
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&t=${timestamp}`, {
        cache: 'no-store' // Force fresh request
      });
      
      const data = await response.json();

      if (data.status !== 'ok') {
        throw new Error(`Invalid RSS feed response for ${url}`);
      }

      console.log(`Received feed data for ${url}:`, data);

      // Get site domain for favicon
      const urlObject = new URL(url);
      const domain = urlObject.hostname;
      const fallbackImage = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

      // Update feed data
      this.feeds.set(url, {
        title: data.feed.title,
        articles: data.items.map(item => ({
          title: item.title,
          link: item.link,
          pubDate: new Date(item.pubDate),
          author: item.author || 'Unknown',
          thumbnail: item.thumbnail || data.feed.image || fallbackImage,
          content: item.content,
          source: data.feed.title
        }))
      });

      console.log(`Successfully updated feed: ${data.feed.title}`);

    } catch (error) {
      console.error(`Error fetching feed ${url}:`, error);
      throw error;
    }
  }

  async addFeed(savedUrl = null) {
    const url = savedUrl || this.urlInput.value.trim();
    if (!url) return;

    try {
      // First fetch the feed
      await this.fetchFeed(url);

      // Only save to localStorage and clear input if this is a new feed
      if (!savedUrl) {
        const feedUrls = Array.from(this.feeds.keys());
        localStorage.setItem('rssFeeds', JSON.stringify(feedUrls));
        this.urlInput.value = '';
      }

      // Update UI
      this.updateFilters();
      this.updateArticles();

    } catch (error) {
      console.error('Error adding feed:', error);
      alert('Error adding RSS feed. Please check the URL and try again.');
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this.editButton.classList.toggle('button--active', this.isEditMode);
    this.updateFilters(); // Refresh filters to show/hide delete buttons
  }

  updateFilters() {
    // Clear existing filters
    while (this.filterContainer.children.length > 1) {
      this.filterContainer.removeChild(this.filterContainer.lastChild);
    }

    // Add filter for each feed
    for (const [url, feed] of this.feeds) {
      const filterWrapper = document.createElement('div');
      filterWrapper.className = 'filter__wrapper';

      const filterButton = document.createElement('button');
      filterButton.className = 'filter__item';
      filterButton.textContent = feed.title;
      filterButton.addEventListener('click', () => this.filterArticles(feed.title));
      filterWrapper.appendChild(filterButton);

      if (this.isEditMode) {
        const deleteButton = document.createElement('button');
        deleteButton.className = 'filter__delete';
        deleteButton.innerHTML = '×';
        deleteButton.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteFeed(url);
        });
        filterWrapper.appendChild(deleteButton);
      }

      this.filterContainer.appendChild(filterWrapper);
    }
  }

  filterArticles(source) {
    this.currentFilter = source;
    this.updateArticles();
    
    // Update active filter styling
    document.querySelectorAll('.filter__item').forEach(button => {
      if (source === 'all') {
        // Make "All Sources" button active when selected
        button.classList.toggle('filter__item--active', 
          button.textContent.trim() === 'All Sources');
      } else {
        // Make specific source button active
        button.classList.toggle('filter__item--active', 
          button.textContent === source);
      }
    });
  }

  updateArticles() {
    console.log('Updating articles display...');
    
    if (!this.articlesContainer) {
      console.error('Articles container is null, cannot update articles');
      return;
    }

    // Combine and sort all articles
    this.articles = Array.from(this.feeds.values())
      .flatMap(feed => feed.articles)
      .filter(article => {
        return this.currentFilter === 'all' || article.source === this.currentFilter;
      })
      .sort((a, b) => b.pubDate - a.pubDate);

    console.log(`Found ${this.articles.length} articles to display:`, this.articles); // Debug log

    // Clear existing articles
    this.articlesContainer.innerHTML = '';

    // Add articles to container
    this.articles.forEach(article => {
      const articleElement = this.createArticleElement(article);
      if (articleElement) {
        this.articlesContainer.appendChild(articleElement);
        console.log('Added article to container:', article.title); // Debug log
      } else {
        console.error('Failed to create article element for:', article);
      }
    });
    
    console.log('Articles display updated, container now contains:', this.articlesContainer.children.length, 'articles');
  }

  createArticleElement(article) {
    if (!article) {
      console.error('Attempted to create article element with null article');
      return null;
    }

    console.log('Creating article element for:', article.title);
    
    const placeholderImage = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiNFNUU3RUIiLz48cGF0aCBkPSJNODAgOTBINzBWMTEwSDgwVjkwWk0xMzAgOTBIMTIwVjExMEgxMzBWOTBaTTExMCA4MEgxMDBWMTIwSDExMFY4MFoiIGZpbGw9IiM5QUEwQTYiLz48L3N2Zz4=';
    
    const template = `
      <article class="article__item">
        <div class="article__image">
          <img src="${article.thumbnail || placeholderImage}" 
               alt="${article.title}" 
               onerror="this.src='${placeholderImage}'">
        </div>
        <div class="article__content">
          <div class="article__meta">
            <span class="article__source">${article.source}</span>
          </div>
          <h2 class="article__title">
            <a href="${article.link}" target="_blank" rel="noopener">${article.title}</a>
          </h2>
          <div class="article__footer">
            ${article.author !== 'Unknown' ? `
              <span class="article__author">By ${article.author}</span>
            ` : ''}
            <span class="article__date">${this.formatDate(article.pubDate)}</span>
          </div>
        </div>
      </article>
    `;

    try {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = template.trim();
      const element = wrapper.firstChild;
      
      if (!element) {
        console.error('Failed to create article element');
        return null;
      }
      
      return element;
    } catch (error) {
      console.error('Error creating article element:', error);
      return null;
    }
  }

  estimateWordCount(content) {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || div.innerText;
    return text.split(/\s+/).length;
  }

  formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // Show relative time for recent articles
    if (minutes < 60) {
      return minutes <= 1 ? 'just now' : `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      // For older articles, show time and date
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
      }).format(date);
    }
  }

  async deleteFeed(url) {
    // Remove feed from Map
    this.feeds.delete(url);
    
    // Update localStorage
    const feedUrls = Array.from(this.feeds.keys());
    localStorage.setItem('rssFeeds', JSON.stringify(feedUrls));
    
    // Update UI
    this.updateFilters();
    this.updateArticles();
  }
}

// Initialize everything after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded');
  
  // Handle mobile menu
  const menuButton = document.querySelector(".icon-menu");
  if (menuButton) {
    menuButton.addEventListener("click", function (event) {
      event.preventDefault();
      document.body.classList.toggle("menu-open");
    });
  }

  // Handle spoller buttons
  const spollerButtons = document.querySelectorAll("[data-spoller] .spollers-faq__button");
  spollerButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const currentItem = button.closest("[data-spoller]");
      const content = currentItem.querySelector(".spollers-faq__text");

      const parent = currentItem.parentNode;
      const isOneSpoller = parent.hasAttribute("data-one-spoller");

      if (isOneSpoller) {
        const allItems = parent.querySelectorAll("[data-spoller]");
        allItems.forEach((item) => {
          if (item !== currentItem) {
            const otherContent = item.querySelector(".spollers-faq__text");
            item.classList.remove("active");
            otherContent.style.maxHeight = null;
          }
        });
      }

      if (currentItem.classList.contains("active")) {
        currentItem.classList.remove("active");
        content.style.maxHeight = null;
      } else {
        currentItem.classList.add("active");
        content.style.maxHeight = content.scrollHeight + "px";
      }
    });
  });

  // Initialize NewsFeed if we're on the news feed page
  if (document.querySelector('.page__newsfeed')) {
    console.log('News feed page detected, creating instance...');
    window.newsFeed = new NewsFeed(); // Store instance globally for debugging
  }
});
