package org.pianoml.backend.config;

import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Clears the library caches ({@link LibraryCacheConfig}) after a write that changes what the library shows: a
 * score created, edited, given its files, re-imported or deleted, a genre or an author created or edited. Not on
 * plays: the lists catch up with play counts when their entries expire.
 */
@Component
public class LibraryCache {

  private final CacheManager cacheManager;

  public LibraryCache(CacheManager cacheManager) {
    this.cacheManager = cacheManager;
  }

  /**
   * Clears every library cache, once the current transaction has committed (a read in between would put the old
   * rows back), or at once outside a transaction.
   */
  public void clear() {
    if (TransactionSynchronizationManager.isSynchronizationActive()) {
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override
        public void afterCommit() {
          clearNow();
        }
      });
    } else {
      clearNow();
    }
  }

  private void clearNow() {
    for (String name : LibraryCacheConfig.names()) {
      Cache cache = cacheManager.getCache(name);
      if (cache != null) {
        cache.clear();
      }
    }
  }
}
