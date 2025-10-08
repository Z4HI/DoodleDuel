// RewardedAd.tsx - Regular Rewarded Ad Component
import { useCallback, useEffect, useState } from 'react';
import { AdEventType, RewardedAd, RewardedAdEventType } from 'react-native-google-mobile-ads';

class RewardedAdManager {
  private static instance: RewardedAdManager;
  private rewardedAd: RewardedAd | null = null;
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  private isShowing: boolean = false;
  private listeners: Map<string, (data: any) => void> = new Map();

  private constructor() {
    this.initAd();
  }

  static getInstance(): RewardedAdManager {
    if (!RewardedAdManager.instance) {
      RewardedAdManager.instance = new RewardedAdManager();
    }
    return RewardedAdManager.instance;
  }

  private getAdUnitId(): string {
    // Always use Google's test ad unit
    return 'ca-app-pub-3940256099942544/5224354917'; // Test rewarded ad unit
  }

  private initAd() {
    if (this.isLoading || this.isLoaded) {
      console.log('⏭️ Rewarded Ad already loading or loaded, skipping init');
      return;
    }

    console.log('🎬 Initializing Rewarded Ad...');
    this.isLoading = true;

    const adUnitId = this.getAdUnitId();
    const ad = RewardedAd.createForAdRequest(adUnitId, {
      requestNonPersonalizedAdsOnly: true,
    });

    // Listen for loaded event
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      console.log('✅ Rewarded Ad loaded successfully!');
      this.isLoaded = true;
      this.isLoading = false;
      this.notifyListeners('loaded', {});
    });

    // Listen for earned reward
    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
      console.log('🎁 User earned reward:', reward);
      this.notifyListeners('rewarded', reward);
    });

    // Listen for ad closed
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      console.log('🔄 Rewarded Ad closed');
      this.isShowing = false;
      this.isLoaded = false;
      this.rewardedAd = null;
      this.notifyListeners('dismissed', {});
      
      // Preload next ad
      setTimeout(() => {
        console.log('🔄 Preloading next rewarded ad...');
        this.initAd();
      }, 1000);
    });

    // Listen for errors
    ad.addAdEventListener(AdEventType.ERROR, (error: any) => {
      console.error('❌ Rewarded Ad load failed:', error);
      this.isLoading = false;
      this.isLoaded = false;
      // Retry after 30 seconds
      setTimeout(() => this.initAd(), 30000);
    });

    // Start loading
    ad.load();
    console.log('📥 Rewarded Ad load request sent');

    this.rewardedAd = ad;
  }

  async show(): Promise<{ success: boolean; rewarded: boolean }> {
    if (this.isShowing) {
      console.warn('⚠️ Rewarded Ad is already showing');
      return { success: false, rewarded: false };
    }

    if (!this.isLoaded || !this.rewardedAd) {
      console.warn('⚠️ Rewarded Ad not ready. Current state:', {
        isLoaded: this.isLoaded,
        isLoading: this.isLoading,
        hasAd: !!this.rewardedAd
      });
      
      // Try to load if not already loading
      if (!this.isLoading) {
        console.log('🔄 Preloading rewarded ad for next time...');
        this.initAd();
      }
      
      return { success: false, rewarded: false };
    }

    return new Promise((resolve) => {
      this.isShowing = true;
      let wasRewarded = false;

      // Set up one-time listener for reward
      const rewardListener = (reward: any) => {
        console.log('🎁 Reward detected in show method:', reward);
        wasRewarded = true;
      };
      this.addListener('rewarded', rewardListener);

      // Set up one-time listener for dismissal
      const dismissListener = () => {
        console.log('✅ Rewarded Ad dismissed. Final reward status:', wasRewarded);
        
        // Remove listeners
        this.removeListener('rewarded', rewardListener);
        this.removeListener('dismissed', dismissListener);

        resolve({ success: true, rewarded: wasRewarded });
      };
      this.addListener('dismissed', dismissListener);

      console.log('📺 Showing rewarded ad...');
      this.rewardedAd.show().catch((error) => {
        console.error('❌ Error showing rewarded ad:', error);
        this.isShowing = false;
        this.isLoaded = false;
        this.rewardedAd = null;

        // Remove listeners
        this.removeListener('rewarded', rewardListener);
        this.removeListener('dismissed', dismissListener);

        // Preload after error
        setTimeout(() => this.initAd(), 2000);

        resolve({ success: false, rewarded: false });
      });
    });
  }

  addListener(event: string, callback: (data: any) => void) {
    const key = `${event}_${Date.now()}_${Math.random()}`;
    this.listeners.set(key, callback);
    return () => this.listeners.delete(key);
  }

  removeListener(event: string, callback: (data: any) => void) {
    const keysToDelete: string[] = [];
    this.listeners.forEach((cb, key) => {
      if (cb === callback) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.listeners.delete(key));
  }

  private notifyListeners(event: string, data: any) {
    this.listeners.forEach((callback, key) => {
      if (key.startsWith(event)) {
        callback(data);
      }
    });
  }

  getStatus() {
    return {
      isLoaded: this.isLoaded,
      isLoading: this.isLoading,
      isShowing: this.isShowing,
    };
  }

  // Force reload
  reload() {
    console.log('🔄 Manual reload requested for rewarded ad');
    this.isLoaded = false;
    this.isLoading = false;
    this.rewardedAd = null;
    this.initAd();
  }
}

export default RewardedAdManager;

// React Hook wrapper
export const useRewardedAd = () => {
  const [status, setStatus] = useState(RewardedAdManager.getInstance().getStatus());

  useEffect(() => {
    const manager = RewardedAdManager.getInstance();
    
    const unsubscribeLoaded = manager.addListener('loaded', () => {
      setStatus(manager.getStatus());
    });

    const unsubscribeDismissed = manager.addListener('dismissed', () => {
      setStatus(manager.getStatus());
    });

    // Update status periodically
    const interval = setInterval(() => {
      setStatus(manager.getStatus());
    }, 1000);

    return () => {
      unsubscribeLoaded();
      unsubscribeDismissed();
      clearInterval(interval);
    };
  }, []);

  const showAd = useCallback(async (onReward?: (rewarded: boolean) => void) => {
    console.log('🎯 Rewarded Ad Hook: showAd called with callback:', !!onReward);
    const result = await RewardedAdManager.getInstance().show();
    
    console.log('🎯 Rewarded Ad Hook: Ad result received:', result);
    
    if (result.success && result.rewarded) {
      console.log('🎯 Rewarded Ad Hook: Calling reward callback with true');
      onReward?.(true);
    } else if (result.success) {
      console.log('🎯 Rewarded Ad Hook: Calling reward callback with false');
      onReward?.(false);
    } else {
      console.log('🎯 Rewarded Ad Hook: Ad not successful, not calling callback');
    }
    
    return result;
  }, []);

  const reload = useCallback(() => {
    RewardedAdManager.getInstance().reload();
  }, []);

  return {
    ...status,
    showAd,
    reload,
  };
};
