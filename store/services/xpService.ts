import { supabase } from '../../SUPABASE/supabaseConfig';
import { XP_REWARDS, calculateXPWithStreak } from '../../utils/tierUtils';
import { authService } from './authService';

interface AwardXPResult {
  success: boolean;
  xp_earned: number;
  total_xp: number;
  old_level: number;
  new_level: number;
  old_tier: number;
  new_tier: number;
  leveled_up: boolean;
  tier_up: boolean;
  baseXP?: number;
  bonusXP?: number;
  multiplier?: number;
}

export const xpService = {
  // Award XP for Word of the Day
  awardWordOfDayXP: async (score: number, streak: number, dispatch: any): Promise<AwardXPResult | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let baseXP = XP_REWARDS.word_of_day_submit;
      
      // Bonus for high score
      if (score >= 80) {
        baseXP += XP_REWARDS.word_of_day_high_score;
      }

      // Apply streak multiplier
      const xpCalc = calculateXPWithStreak(baseXP, streak);

      // Award XP via database function
      const { data, error } = await supabase.rpc('award_xp', {
        target_user_id: user.id,
        xp_amount: xpCalc.totalXP,
        game_mode: 'word_of_day',
        result_type: 'submit'
      });

      if (error) {
        console.error('Error awarding XP:', error);
        return null;
      }

      // Refresh user info to show updated XP/level/tier
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        dispatch(authService.fetchUserInfo(session));
      }

      // Also return the data from the award_xp function
      console.log('XP Award Result:', data);

      return {
        ...data,
        baseXP: xpCalc.baseXP,
        bonusXP: xpCalc.bonusXP,
        multiplier: xpCalc.multiplier
      };
    } catch (error) {
      console.error('Error in awardWordOfDayXP:', error);
      return null;
    }
  },

  // Award XP for Doodle Hunt
  awardDoodleHuntXP: async (won: boolean, attempts: number, streak: number, dispatch: any): Promise<AwardXPResult | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let baseXP = won ? XP_REWARDS.doodle_hunt_win : XP_REWARDS.doodle_hunt_loss;
      
      // Bonus for fast win (<3 guesses)
      if (won && attempts <= 3) {
        baseXP += XP_REWARDS.doodle_hunt_fast_win;
      }

      // Apply streak multiplier
      const xpCalc = calculateXPWithStreak(baseXP, streak);

      // Award XP
      const { data, error } = await supabase.rpc('award_xp', {
        target_user_id: user.id,
        xp_amount: xpCalc.totalXP,
        game_mode: 'doodle_hunt',
        result_type: won ? 'win' : 'loss'
      });

      if (error) {
        console.error('Error awarding XP:', error);
        return null;
      }

      // Refresh user info
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        dispatch(authService.fetchUserInfo(session));
      }

      console.log('Doodle Hunt XP Award Result:', data);

      return {
        ...data,
        baseXP: xpCalc.baseXP,
        bonusXP: xpCalc.bonusXP,
        multiplier: xpCalc.multiplier
      };
    } catch (error) {
      console.error('Error in awardDoodleHuntXP:', error);
      return null;
    }
  },

  // Award XP for Duel
  awardDuelXP: async (won: boolean, similarity: number, dispatch: any): Promise<AwardXPResult | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let xpAmount = won ? XP_REWARDS.duel_win : XP_REWARDS.duel_loss;
      
      // Bonus for perfect score
      if (won && similarity >= 100) {
        xpAmount += XP_REWARDS.duel_perfect;
      }

      // No streak multiplier for Duel (not a daily game)

      // Award XP
      const { data, error } = await supabase.rpc('award_xp', {
        target_user_id: user.id,
        xp_amount: xpAmount,
        game_mode: 'duel',
        result_type: won ? 'win' : 'loss'
      });

      if (error) {
        console.error('Error awarding XP:', error);
        return null;
      }

      // Refresh user info
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await dispatch(authService.fetchUserInfo(session));
      }

      return data;
    } catch (error) {
      console.error('Error in awardDuelXP:', error);
      return null;
    }
  },

  // Award XP for Roulette
  awardRouletteXP: async (won: boolean, maxPlayers: number, dispatch: any): Promise<AwardXPResult | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let xpAmount: number;
      
      if (maxPlayers === 4) {
        xpAmount = won ? XP_REWARDS.roulette_4p_win : XP_REWARDS.roulette_4p_loss;
      } else {
        xpAmount = won ? XP_REWARDS.roulette_2p_win : XP_REWARDS.roulette_2p_loss;
      }

      // No streak multiplier for Roulette (not a daily game)

      console.log('Awarding Roulette XP:', { won, maxPlayers, xpAmount });

      // Award XP
      const { data, error } = await supabase.rpc('award_xp', {
        target_user_id: user.id,
        xp_amount: xpAmount,
        game_mode: maxPlayers === 4 ? 'roulette_4p' : 'roulette_2p',
        result_type: won ? 'win' : 'loss'
      });

      if (error) {
        console.error('Error awarding XP:', error);
        return null;
      }

      console.log('Roulette XP Award Result:', data);

      // Refresh user info - force immediate refresh
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        dispatch(authService.fetchUserInfo(session));
      }

      return data;
    } catch (error) {
      console.error('Error in awardRouletteXP:', error);
      return null;
    }
  },
};

