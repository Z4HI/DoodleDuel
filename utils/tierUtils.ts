// Tier system utilities and styling

export interface TierInfo {
  tier: number;
  name: string;
  color: string;
  secondaryColor?: string;
  borderWidth: number;
  glowColor?: string;
  hasGlow: boolean;
  hasGradient: boolean;
}

export const XP_REWARDS = {
  // Word of the Day
  word_of_day_submit: 100,
  word_of_day_high_score: 50, // Bonus for 80%+
  
  // Doodle Hunt
  doodle_hunt_win: 200,
  doodle_hunt_loss: 0,
  doodle_hunt_fast_win: 50, // Bonus <3 guesses
  
  // Duel Mode
  duel_win: 200,
  duel_loss: 50,
  duel_perfect: 100, // Bonus 100% similarity
  
  // Roulette 2-Player
  roulette_2p_win: 300,
  roulette_2p_loss: 60,
  
  // Roulette 4-Player
  roulette_4p_win: 400,
  roulette_4p_loss: 80,
};

// Streak multipliers for daily games (Option 1: Milestone Bonuses)
export function getStreakMultiplier(streak: number): number {
  if (streak >= 100) return 3.0;   // 100+ days: Triple XP!
  if (streak >= 60) return 2.5;    // 60+ days: 2.5x XP
  if (streak >= 30) return 2.0;    // 30+ days: Double XP!
  if (streak >= 14) return 1.75;   // 2+ weeks: +75%
  if (streak >= 7) return 1.5;     // 1 week: +50%
  if (streak >= 3) return 1.25;    // 3+ days: +25%
  return 1.0;                       // Base (no bonus)
}

// Get the next milestone for display
export function getNextStreakMilestone(streak: number): { days: number; multiplier: number } | null {
  if (streak < 3) return { days: 3, multiplier: 1.25 };
  if (streak < 7) return { days: 7, multiplier: 1.5 };
  if (streak < 14) return { days: 14, multiplier: 1.75 };
  if (streak < 30) return { days: 30, multiplier: 2.0 };
  if (streak < 60) return { days: 60, multiplier: 2.5 };
  if (streak < 100) return { days: 100, multiplier: 3.0 };
  return null; // Max milestone reached
}

// Calculate final XP with streak bonus
export function calculateXPWithStreak(baseXP: number, streak: number): {
  baseXP: number;
  multiplier: number;
  bonusXP: number;
  totalXP: number;
} {
  const multiplier = getStreakMultiplier(streak);
  const totalXP = Math.floor(baseXP * multiplier);
  const bonusXP = totalXP - baseXP;
  
  return {
    baseXP,
    multiplier,
    bonusXP,
    totalXP,
  };
}

export function getTierInfo(tier: number): TierInfo {
  switch (tier) {
    case 1: // Bronze (Levels 1-10)
      return {
        tier: 1,
        name: 'Bronze',
        color: '#CD7F32',
        borderWidth: 3,
        hasGlow: false,
        hasGradient: false,
      };
    
    case 2: // Silver (Levels 11-20)
      return {
        tier: 2,
        name: 'Silver',
        color: '#C0C0C0',
        borderWidth: 4,
        glowColor: 'rgba(192, 192, 192, 0.3)',
        hasGlow: true,
        hasGradient: false,
      };
    
    case 3: // Gold (Levels 21-30)
      return {
        tier: 3,
        name: 'Gold',
        color: '#FFD700',
        borderWidth: 5,
        glowColor: 'rgba(255, 215, 0, 0.4)',
        hasGlow: true,
        hasGradient: false,
      };
    
    case 4: // Platinum (Levels 31-40)
      return {
        tier: 4,
        name: 'Platinum',
        color: '#E5E4E2',
        secondaryColor: '#B4B4B4',
        borderWidth: 6,
        glowColor: 'rgba(229, 228, 226, 0.5)',
        hasGlow: true,
        hasGradient: true,
      };
    
    case 5: // Diamond (Levels 41-50)
      return {
        tier: 5,
        name: 'Diamond',
        color: '#B9F2FF',
        secondaryColor: '#4DD0E1',
        borderWidth: 6,
        glowColor: 'rgba(77, 208, 225, 0.6)',
        hasGlow: true,
        hasGradient: true,
      };
    
    case 6: // Master (Levels 51-60)
      return {
        tier: 6,
        name: 'Master',
        color: '#9400D3',
        secondaryColor: '#FFD700',
        borderWidth: 7,
        glowColor: 'rgba(148, 0, 211, 0.7)',
        hasGlow: true,
        hasGradient: true,
      };
    
    case 7: // Grandmaster (Levels 61-70)
      return {
        tier: 7,
        name: 'Grandmaster',
        color: '#FF6B35', // Rainbow start
        secondaryColor: '#4ECDC4', // Rainbow end
        borderWidth: 8,
        glowColor: 'rgba(255, 107, 53, 0.8)',
        hasGlow: true,
        hasGradient: true,
      };
    
    case 8: // Legend (Levels 71+)
      return {
        tier: 8,
        name: 'Legend',
        color: '#FFD700',
        secondaryColor: '#FF0000',
        borderWidth: 9,
        glowColor: 'rgba(255, 215, 0, 0.9)',
        hasGlow: true,
        hasGradient: true,
      };
    
    default:
      return {
        tier: 1,
        name: 'Bronze',
        color: '#CD7F32',
        borderWidth: 3,
        hasGlow: false,
        hasGradient: false,
      };
  }
}

export function getTierFromLevel(level: number): number {
  if (level >= 71) return 8; // Legend
  if (level >= 61) return 7; // Grandmaster
  if (level >= 51) return 6; // Master
  if (level >= 41) return 5; // Diamond
  if (level >= 31) return 4; // Platinum
  if (level >= 21) return 3; // Gold
  if (level >= 11) return 2; // Silver
  return 1; // Bronze
}

export function getLevelFromXP(xp: number): number {
  let level = 1;
  let requiredXP = 0;
  
  // Each level requires level * 100 XP
  while (requiredXP <= xp) {
    requiredXP += (level * 100);
    if (requiredXP <= xp) {
      level++;
    }
  }
  
  return level;
}

export function getXPForNextLevel(currentLevel: number): number {
  return (currentLevel + 1) * 100;
}

export function getCumulativeXP(level: number): number {
  // Total XP needed to reach this level
  // Formula: 100 * (level-1) * level / 2
  return 100 * (level - 1) * level / 2;
}

export function getCurrentLevelProgress(totalXP: number, currentLevel: number): {
  currentLevelXP: number;
  xpForNextLevel: number;
  progressPercent: number;
} {
  const cumulativeXPForCurrentLevel = getCumulativeXP(currentLevel);
  const currentLevelXP = totalXP - cumulativeXPForCurrentLevel;
  const xpForNextLevel = getXPForNextLevel(currentLevel);
  const progressPercent = Math.min(100, (currentLevelXP / xpForNextLevel) * 100);
  
  return {
    currentLevelXP,
    xpForNextLevel,
    progressPercent,
  };
}

