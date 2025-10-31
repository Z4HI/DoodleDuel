import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { sendDuelAcceptedNotification, sendDuelSentNotification } from '../NOTIFICATIONS/duelNotificationUtils';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { Friend, FriendRequest, friendsService } from '../store/services/friendsService';
import { setUserInfo } from '../store/slices/authSlice';
import { supabase } from '../SUPABASE/supabaseConfig';

interface User {
  id: string;
  username: string;
  email: string;
}

interface UserWithStatus extends User {
  friendshipStatus?: 'friends' | 'request_sent' | 'request_received' | 'none' | 'loading';
  requestId?: string;
}

interface DuelInvitation {
  id: string;
  challenger_id: string;
  opponent_id: string;
  word: string;
  difficulty: string;
  gamemode: 'doodleDuel' | 'doodleHunt';
  status: 'duel_sent' | 'in_progress' | 'completed';
  created_at: string;
  challenger_username: string;
  opponent_username: string;
  isChallenger: boolean; // Whether current user is the challenger
  winner_id?: string | null;
}

export default function DuelFriendScreen({ route }: any) {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const reduxDispatch = useDispatch();
  
  // Get user info from Redux store
  const userInfo = useSelector((state: RootState) => state.auth.userInfo);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'gameInvites'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [duelInvitations, setDuelInvitations] = useState<DuelInvitation[]>([]);
  const [unacceptedChallengesCount, setUnacceptedChallengesCount] = useState(0);
  const [searchResults, setSearchResults] = useState<UserWithStatus[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGameModeModal, setShowGameModeModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  // Function to subtract a token from user's profile
  const subtractToken = async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user found');
        return false;
      }

      // Get current tokens
      const { data: currentProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('game_tokens')
        .eq('id', user.id)
        .single();

      if (fetchError) {
        console.error('Error fetching current tokens:', fetchError);
        return false;
      }

      const currentTokens = currentProfile?.game_tokens || 0;
      
      if (currentTokens < 1) {
        console.log('User has no tokens to spend');
        return false;
      }

      const newTokens = currentTokens - 1;

      // Update tokens in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ game_tokens: newTokens })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating tokens:', updateError);
        return false;
      }

      // Update Redux store with new token count
      if (userInfo) {
        reduxDispatch(setUserInfo({
          ...userInfo,
          game_tokens: newTokens
        }));
      }

      console.log(`✅ Token spent: ${currentTokens} - 1 = ${newTokens}`);
      return true;
    } catch (error) {
      console.error('Error subtracting token:', error);
      return false;
    }
  };

  // Handle navigation from push notifications
  useEffect(() => {
    if (route?.params?.tab === 'requests') {
      setActiveTab('friends'); // Switch to friends tab to show requests
    }
  }, [route?.params?.tab]);



  // Load friends and requests when component mounts
  useEffect(() => {
    loadData();
  }, []);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      console.log('DuelFriendScreen focused, refreshing data...');
      loadData();
    }, [])
  );

  // Subscribe to realtime changes on friend_requests and friends tables
  useEffect(() => {
    const channel = supabase
      .channel('duelfriend-realtime-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests'
        },
        (payload) => {
          console.log('DuelFriendScreen received friend_requests event:', payload);
          // Refresh data when friend requests change
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friends'
        },
        (payload) => {
          console.log('DuelFriendScreen received friends event:', payload);
          // Refresh data when friends list changes
          loadData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duels'
        },
        (payload) => {
          console.log('DuelFriendScreen received duels event:', payload);
          // Refresh data when duels change
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


  const loadData = async () => {
    setLoading(true);
    try {
      // Load friends, requests, and duel invitations in parallel
      const [friendsResult, requestsResult, duelInvitationsResult] = await Promise.all([
        friendsService.getFriends()(dispatch),
        friendsService.getPendingRequests()(dispatch),
        loadDuelInvitations()
      ]);

      // Process friends
      if (friendsResult.success) {
        console.log('Friends data:', friendsResult.data);
        setFriends(friendsResult.data);
      }

      // Process requests
      if (requestsResult.success) {
        console.log('Requests data:', requestsResult.data);
        setRequests(requestsResult.data);
      }

      // Process duel invitations
      if (duelInvitationsResult.success && duelInvitationsResult.data) {
        console.log('Duel invitations data:', duelInvitationsResult.data);
        setDuelInvitations(duelInvitationsResult.data);
        
        // Calculate unaccepted challenges count (duels where user is opponent and status is 'duel_sent')
        const unacceptedCount = duelInvitationsResult.data.filter(
          duel => !duel.isChallenger && duel.status === 'duel_sent'
        ).length;
        setUnacceptedChallengesCount(unacceptedCount);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDuelInvitations = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        return { success: false, error: 'No authenticated user' };
      }

      // Get duels where current user is either challenger or opponent
      const { data: duels, error } = await supabase
        .from('duels')
        .select(`
          id,
          challenger_id,
          opponent_id,
          word,
          difficulty,
          gamemode,
          status,
          winner_id,
          created_at,
          challenger:challenger_id(username),
          opponent:opponent_id(username)
        `)
        .or(`challenger_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
        .in('status', ['duel_sent', 'in_progress', 'completed'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading duel invitations:', error);
        return { success: false, error: error.message };
      }

      // Transform the data to include usernames and isChallenger flag
      const transformedDuels: DuelInvitation[] = (duels || []).map(duel => ({
        id: duel.id,
        challenger_id: duel.challenger_id,
        opponent_id: duel.opponent_id,
        word: duel.word,
        difficulty: duel.difficulty,
        gamemode: duel.gamemode as 'doodleDuel' | 'doodleHunt',
        status: duel.status as 'duel_sent' | 'in_progress' | 'completed',
        created_at: duel.created_at,
        challenger_username: (duel.challenger as any)?.username || 'Unknown',
        opponent_username: (duel.opponent as any)?.username || 'Unknown',
        isChallenger: duel.challenger_id === currentUser.id,
        winner_id: duel.winner_id
      }));

      // Sort: in_progress first, then duel_sent, then completed; within each, newest first
      const statusRank: Record<'in_progress' | 'duel_sent' | 'completed', number> = {
        in_progress: 0,
        duel_sent: 1,
        completed: 2,
      };
      transformedDuels.sort((a, b) => {
        const rankDiff = statusRank[a.status] - statusRank[b.status];
        if (rankDiff !== 0) return rankDiff;
        const aTime = Date.parse(a.created_at || '');
        const bTime = Date.parse(b.created_at || '');
        return (isNaN(bTime) ? 0 : bTime) - (isNaN(aTime) ? 0 : aTime);
      });

      return { success: true, data: transformedDuels };
    } catch (error) {
      console.error('Error loading duel invitations:', error);
      return { success: false, error: 'Failed to load duel invitations' };
    }
  };

  // Search for users when query changes
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.length >= 3) {
        setIsSearching(true);
        setShowSearchResults(true);
        
        try {
          // Get current user ID to exclude from search
          const { data: { user: currentUser } } = await supabase.auth.getUser();
          
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, email')
            .ilike('username', `%${searchQuery}%`)
            .neq('id', currentUser?.id || '') // Exclude current user
            .limit(10);

          if (error) {
            console.error('Error searching users:', error);
            setSearchResults([]);
          } else {
            // Check friendship status for each user
            const usersWithStatus: UserWithStatus[] = await Promise.all(
              (data || []).map(async (user) => {
                const statusResult = await friendsService.checkFriendshipStatus(user.id)(dispatch);
                return {
                  ...user,
                  friendshipStatus: statusResult.status as any,
                  requestId: statusResult.requestId
                };
              })
            );
            setSearchResults(usersWithStatus);
          }
        } catch (error) {
          console.error('Error searching users:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [searchQuery, dispatch]);


  const handleSearchUserSelect = async (user: UserWithStatus) => {
    if (user.friendshipStatus === 'friends') {
      // User is already a friend, do nothing or show a message
      Alert.alert('Already Friends', `You are already friends with @${user.username}`);
    } else if (user.friendshipStatus === 'none') {
      handleSendFriendRequest(user);
    } else if (user.friendshipStatus === 'request_received') {
      handleAcceptFriendRequest(user);
    }
  };

  const handleSendFriendRequest = async (user: UserWithStatus) => {
    // Immediately update the button state to "Request Sent"
    setSearchResults(prevResults => 
      prevResults.map(item => 
        item.id === user.id 
          ? { ...item, friendshipStatus: 'request_sent' as const }
          : item
      )
    );

    const result = await friendsService.sendFriendRequest(user.id)(dispatch);
    if (result.success) {
      Alert.alert('Friend Request Sent', `Friend request sent to @${user.username}`);
      // No need to refresh search results since we already updated the state
    } else {
      // Revert the button state if the request failed
      setSearchResults(prevResults => 
        prevResults.map(item => 
          item.id === user.id 
            ? { ...item, friendshipStatus: 'none' as const }
            : item
        )
      );
      Alert.alert('Error', result.error || 'Failed to send friend request');
    }
  };

  const handleAcceptFriendRequest = async (user: UserWithStatus) => {
    if (user.requestId) {
      const result = await friendsService.acceptFriendRequest(user.requestId)(dispatch);
      if (result.success) {
        Alert.alert('Friend Request Accepted', `You are now friends with @${user.username}`);
        // Refresh data
        loadData();
      } else {
        Alert.alert('Error', result.error || 'Failed to accept friend request');
      }
    }
  };

  const handleSearchInputChange = (text: string) => {
    setSearchQuery(text);
    if (text.length < 3) {
      setShowSearchResults(false);
    }
  };

  const handleAcceptDuelInvitation = async (duelId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No authenticated user found');
        Alert.alert('Error', 'You must be logged in to accept duels.');
        return;
      }

      // Use the accept_duel RPC function which handles turn initialization for Doodle Hunt
      const { error } = await supabase.rpc('accept_duel', {
        duel_uuid: duelId
      });

      if (error) {
        console.error('Error accepting duel:', error);
        Alert.alert('Error', 'Failed to accept duel. Please try again.');
        return;
      }

      // Send push notification to challenger
      console.log('About to send duel accepted notification for duel:', duelId);
      const notificationSent = await sendDuelAcceptedNotification(duelId);
      if (!notificationSent) {
        console.log('Failed to send duel accepted notification, but duel was accepted successfully');
      }


      // Find the duel invitation to get the gamemode
      const duelInvitation = duelInvitations.find(duel => duel.id === duelId);
      
      if (duelInvitation) {
        // Navigate to the appropriate screen based on gamemode
      if (duelInvitation.gamemode === 'doodleDuel') {
        (navigation as any).navigate('DoodleDuelFriend', { duelId });
      } else if (duelInvitation.gamemode === 'doodleHunt') {
        (navigation as any).navigate('DoodleHuntFriend', { duelId });
      }
      } else {
        Alert.alert('Duel Accepted!', 'The duel has been accepted. You can now start drawing!');
      }
      
      // Refresh data to update the UI and badge count
      loadData();
    } catch (error) {
      console.error('Error accepting duel:', error);
      Alert.alert('Error', 'Failed to accept duel. Please try again.');
    }
  };

  const handleDeclineDuelInvitation = async (duelId: string) => {
    try {
      const { error } = await supabase.rpc('decline_duel', {
        duel_uuid: duelId
      });

      if (error) {
        console.error('Error declining duel:', error);
        Alert.alert('Error', 'Failed to decline duel. Please try again.');
        return;
      }

      Alert.alert('Duel Declined', 'The duel request has been declined.');
      // Refresh data to update the UI and badge count
      loadData();
    } catch (error) {
      console.error('Error declining duel:', error);
      Alert.alert('Error', 'Failed to decline duel. Please try again.');
    }
  };

  const handleDuelFriend = (friend: Friend) => {
    setSelectedFriend(friend);
    setShowGameModeModal(true);
  };

  const handleGameModeSelection = async (gameMode: 'doodleHunt' | 'doodleDuel') => {
    if (!selectedFriend) return;

    // Check if user has enough tokens
    const userTokens = userInfo?.game_tokens || 0;
    if (userTokens < 1) {
      Alert.alert(
        'Insufficient Tokens',
        'You need at least 1 token to start a duel. Watch an ad to earn tokens!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Earn Tokens', onPress: () => {
            // Navigate to home screen where user can watch ads for tokens
            (navigation as any).navigate('Home');
          }}
        ]
      );
      setShowGameModeModal(false);
      setSelectedFriend(null);
      return;
    }

    setShowGameModeModal(false);

    if (gameMode === 'doodleDuel') {
      await sendDoodleDuelRequest(selectedFriend);
    } else if (gameMode === 'doodleHunt') {
      await sendDoodleHuntRequest(selectedFriend);
    }

    setSelectedFriend(null);
  };

  const sendDoodleDuelRequest = async (friend: Friend) => {
    try {
      // Get a random word from the database
      const { data: randomWord, error: wordError } = await supabase
        .rpc('get_random_word', { difficulty_level: 'easy' });

      if (wordError || !randomWord || randomWord.length === 0) {
        Alert.alert('Error', 'Failed to get a word for the duel. Please try again.');
        return;
      }

      const selectedWord = randomWord[0];

      Alert.alert(
        'Start DoodleDuel',
        `Do you want to start a DoodleDuel with @${friend.username}?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Start Duel',
            onPress: async () => {
              try {
                // Create the duel in the database with gamemode
                console.log('Creating DoodleDuel with:', {
                  opponent_uuid: friend.friend_id,
                  word_text: selectedWord.word,
                  difficulty_level: selectedWord.difficulty,
                  game_mode: 'doodleDuel'
                });
                
                // Get current user ID
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  console.error('No authenticated user found');
                  Alert.alert('Error', 'You must be logged in to create duels.');
                  return;
                }

                // Check if there's already an active duel between these users
                const { data: existingDuel } = await supabase
                  .from('duels')
                  .select('id')
                  .or(`and(challenger_id.eq.${user.id},opponent_id.eq.${friend.friend_id}),and(challenger_id.eq.${friend.friend_id},opponent_id.eq.${user.id})`)
                  .in('status', ['duel_sent', 'in_progress'])
                  .single();

                if (existingDuel) {
                  Alert.alert(
                    'Duel Already Active', 
                    `You already have an active duel with @${friend.username}. Please complete it before starting a new one.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }

                // Create the duel with status 'duel_sent'
                const { data: duelId, error: duelError } = await supabase
                  .from('duels')
                  .insert({
                    challenger_id: user.id,
                    opponent_id: friend.friend_id,
                    word: selectedWord.word,
                    difficulty: selectedWord.difficulty,
                    gamemode: 'doodleDuel',
                    status: 'duel_sent'
                  })
                  .select('id')
                  .single();

                console.log('DoodleDuel creation result:', { duelId, duelError });

                if (duelError) {
                  // Check if it's the specific "active duel exists" error
                  if (duelError.code === 'P0001') {
                    // Suppress logging for this expected error since we handle it gracefully
                    Alert.alert(
                      'Duel Already Active', 
                      `You currently have a duel already in progress with @${friend.username}. Please complete or cancel the existing duel before starting a new one.`
                    );
                  } else {
                    // Log unexpected errors
                    console.error('Error creating DoodleDuel:', duelError);
                    Alert.alert('Error', 'Failed to create duel. Please try again.');
                  }
                  return;
                }

                console.log('DoodleDuel created with ID:', duelId);
                
                // Send push notification to opponent
                console.log('About to send notification for duel:', duelId.id);
                const notificationSent = await sendDuelSentNotification(duelId.id);
                if (!notificationSent) {
                  console.log('Failed to send duel notification, but duel was created successfully');
                }
                
                // Deduct 1 token for successful duel creation
                const tokenDeducted = await subtractToken();
                if (!tokenDeducted) {
                  console.error('Failed to deduct token after duel creation');
                  // Note: We don't rollback the duel creation here as it's already committed
                  // The user will be charged the token on their next successful action
                }
                
                // Show success message and refresh data
                Alert.alert('DoodleDuel Sent!', `DoodleDuel request sent to @${friend.username}. They need to accept it before you can start drawing.`);
                
                // Small delay to ensure duel is committed to database
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Refresh data to update button status
                console.log('Refreshing data after duel creation...');
                await loadData();
                console.log('Data refreshed');
              } catch (error) {
                console.error('Error starting DoodleDuel:', error);
                Alert.alert('Error', 'Failed to start duel. Please try again.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error getting random word:', error);
      Alert.alert('Error', 'Failed to get a word for the duel. Please try again.');
    }
  };

  const sendDoodleHuntRequest = async (friend: Friend) => {
    try {
      // Get a random word from the database
      const { data: randomWord, error: wordError } = await supabase
        .rpc('get_random_word', { difficulty_level: 'easy' });

      if (wordError || !randomWord || randomWord.length === 0) {
        Alert.alert('Error', 'Failed to get a word for the duel. Please try again.');
        return;
      }

      const selectedWord = randomWord[0];

      Alert.alert(
        'Start DoodleHunt Duel',
        `Challenge @${friend.username} to a DoodleHunt duel with the word "${selectedWord.word}"?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Send Challenge',
            onPress: async () => {
              try {
                // Create the duel with doodleHunt gamemode
                console.log('Creating DoodleHunt with:', {
                  opponent_uuid: friend.friend_id,
                  word_text: selectedWord.word,
                  difficulty_level: selectedWord.difficulty,
                  game_mode: 'doodleHunt'
                });
                
                // Get current user ID
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  console.error('No authenticated user found');
                  Alert.alert('Error', 'You must be logged in to create duels.');
                  return;
                }

                // Check if there's already an active duel between these users
                const { data: existingDuel } = await supabase
                  .from('duels')
                  .select('id')
                  .or(`and(challenger_id.eq.${user.id},opponent_id.eq.${friend.friend_id}),and(challenger_id.eq.${friend.friend_id},opponent_id.eq.${user.id})`)
                  .in('status', ['duel_sent', 'in_progress'])
                  .single();

                if (existingDuel) {
                  Alert.alert(
                    'Duel Already Active', 
                    `You already have an active duel with @${friend.username}. Please complete it before starting a new one.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }

                // Create the duel with status 'duel_sent'
                const { data: duelId, error: duelError } = await supabase
                  .from('duels')
                  .insert({
                    challenger_id: user.id,
                    opponent_id: friend.friend_id,
                    word: selectedWord.word,
                    difficulty: selectedWord.difficulty,
                    gamemode: 'doodleHunt',
                    status: 'duel_sent'
                  })
                  .select('id')
                  .single();

                console.log('DoodleHunt creation result:', { duelId, duelError });

                if (duelError) {
                  if (duelError.code === 'P0001') {
                    // Suppress logging for this expected error since we handle it gracefully
                    Alert.alert(
                      'Duel Already Active', 
                      `You currently have a duel already in progress with @${friend.username}. Please complete or cancel the existing duel before starting a new one.`
                    );
                  } else {
                    // Log unexpected errors
                    console.error('Error creating DoodleHunt:', duelError);
                    Alert.alert('Error', 'Failed to create duel. Please try again.');
                  }
                  return;
                }

                console.log('DoodleHunt created with ID:', duelId);
                
                // Send push notification to opponent
                console.log('About to send notification for duel:', duelId.id);
                const notificationSent = await sendDuelSentNotification(duelId.id);
                if (!notificationSent) {
                  console.log('Failed to send duel notification, but duel was created successfully');
                }
                
                // Deduct 1 token for successful duel creation
                const tokenDeducted = await subtractToken();
                if (!tokenDeducted) {
                  console.error('Failed to deduct token after duel creation');
                  // Note: We don't rollback the duel creation here as it's already committed
                  // The user will be charged the token on their next successful action
                }
                
                // Show success message and refresh data
                Alert.alert('DoodleHunt Challenge Sent!', `Your DoodleHunt challenge has been sent to @${friend.username}. They will receive a notification.`);
                
                // Small delay to ensure duel is committed to database
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Refresh data to update button status
                console.log('Refreshing data after duel creation...');
                await loadData();
                console.log('Data refreshed');
              } catch (error) {
                console.error('Error starting DoodleHunt:', error);
                Alert.alert('Error', 'Failed to start duel. Please try again.');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error getting random word:', error);
      Alert.alert('Error', 'Failed to get a word for the duel. Please try again.');
    }
  };

  const handleDeclineFriendRequest = async (requestId: string, username: string) => {
    console.log('Declining friend request with ID:', requestId);
    
    if (!requestId || requestId === 'undefined') {
      Alert.alert('Error', 'Invalid request ID');
      return;
    }

    const result = await friendsService.declineFriendRequest(requestId)(dispatch);
    console.log('Decline result:', result);
    
    if (result.success) {
      Alert.alert('Friend Request Declined', `Declined friend request from @${username}`);
      // Refresh data
      loadData();
    } else {
      Alert.alert('Error', result.error || 'Failed to decline friend request');
    }
  };




  const renderFriendItem = ({ item }: { item: Friend }) => {
    return (
      <View style={styles.userItem}>
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.username}</Text>
          <Text style={styles.friendTime}>
            Friends since {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.duelButton}
          onPress={() => handleDuelFriend(item)}
        >
          <Text style={styles.duelButtonText}>⚔️ Duel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderRequestItem = ({ item }: { item: FriendRequest }) => {
    console.log('Rendering request item:', item);
    return (
      <View style={styles.userItem}>
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.sender_username}</Text>
          <Text style={styles.requestTime}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.requestButtons}>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={() => {
              console.log('Decline button pressed for item:', item);
              handleDeclineFriendRequest(item.request_id, item.sender_username || 'Unknown');
            }}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptFriendRequest({
              id: item.sender_id,
              username: item.sender_username || 'Unknown',
              email: '',
              friendshipStatus: 'request_received',
              requestId: item.request_id
            })}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSearchResultItem = ({ item }: { item: UserWithStatus }) => {
    const getButtonInfo = () => {
      switch (item.friendshipStatus) {
        case 'request_sent':
          return { text: 'Request Sent', style: styles.searchRequestSentButton, textStyle: styles.searchRequestSentButtonText };
        case 'request_received':
          return { text: 'Accept', style: styles.searchAcceptButton, textStyle: styles.searchAcceptButtonText };
        case 'friends':
          return { text: 'Friends', style: styles.searchFriendsButton, textStyle: styles.searchFriendsButtonText };
        case 'none':
          return { text: 'Add Friend', style: styles.searchAddFriendButton, textStyle: styles.searchAddFriendButtonText };
        case 'loading':
          return { text: 'Loading...', style: styles.searchLoadingButton, textStyle: styles.searchLoadingButtonText };
        default:
          return { text: 'Add Friend', style: styles.searchAddFriendButton, textStyle: styles.searchAddFriendButtonText };
      }
    };

    const buttonInfo = getButtonInfo();

    return (
      <TouchableOpacity
        style={styles.searchResultItem}
        onPress={() => handleSearchUserSelect(item)}
        disabled={item.friendshipStatus === 'loading' || item.friendshipStatus === 'request_sent'}
      >
        <View style={styles.userInfo}>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        <View style={buttonInfo.style}>
          <Text style={buttonInfo.textStyle}>{buttonInfo.text}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const handleDuelInvitationPress = (item: DuelInvitation) => {
    // Navigate based on duel status
    if (item.status === 'in_progress') {
      // Navigate to drawing screen for in-progress duels
      if (item.gamemode === 'doodleDuel') {
        (navigation as any).navigate('DoodleDuelFriend', { duelId: item.id });
      } else if (item.gamemode === 'doodleHunt') {
        (navigation as any).navigate('DoodleHuntFriend', { duelId: item.id });
      }
    } else if (item.status === 'completed') {
      // Navigate to results screen for completed duels
      (navigation as any).navigate('DuelFriendResults', { 
        duelId: item.id
      });
    }
  };

  const renderDuelInvitationItem = ({ item }: { item: DuelInvitation }) => (
    <TouchableOpacity 
      style={[
        styles.duelInvitationItem,
        item.status === 'completed'
          ? (item.winner_id && item.winner_id === (userInfo?.id || '')
              ? styles.completedWin
              : styles.completedLoss)
          : null
      ]}
      onPress={() => handleDuelInvitationPress(item)}
      disabled={item.status !== 'in_progress' && item.status !== 'completed'}
      activeOpacity={(item.status === 'in_progress' || item.status === 'completed') ? 0.7 : 1}
    >
      <View style={styles.duelInvitationInfo}>
        <Text style={styles.duelInvitationTitle}>
          {item.isChallenger 
            ? `${item.gamemode === 'doodleDuel' ? 'DoodleDuel' : 'DoodleHunt'} sent to ${item.opponent_username}`
            : `${item.challenger_username} challenged you to ${item.gamemode === 'doodleDuel' ? 'DoodleDuel' : 'DoodleHunt'}`
          }
        </Text>
        <Text style={styles.duelInvitationTime}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.duelInvitationActions}>
        {item.isChallenger ? (
          <Text style={styles.pendingText}>
            {item.status === 'duel_sent' ? 'Waiting for response' : 
             item.status === 'in_progress' ? 'In Progress' : 'Completed'}
          </Text>
        ) : (
          item.status === 'duel_sent' ? (
            <View style={styles.duelActionButtons}>
              <TouchableOpacity
                style={styles.declineDuelButton}
                onPress={() => handleDeclineDuelInvitation(item.id)}
              >
                <Text style={styles.declineDuelButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptDuelButton}
                onPress={() => handleAcceptDuelInvitation(item.id)}
              >
                <Text style={styles.acceptDuelButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.pendingText}>
              {item.status === 'in_progress' ? 'In Progress' : 'Completed'}
            </Text>
          )
        )}
        {item.status === 'in_progress' && (
          <Text style={styles.tapToContinueText}>Tap to continue</Text>
        )}
        {item.status === 'completed' && (
          <Text style={styles.tapToContinueText}>View Results</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  // Combine friends and requests into a single list
  const combinedData = [
    ...requests.map(request => ({ type: 'request' as const, data: request })),
    ...friends.map(friend => ({ type: 'friend' as const, data: friend }))
  ];

  const renderCombinedItem = ({ item }: { item: { type: 'request' | 'friend', data: FriendRequest | Friend } }) => {
    if (item.type === 'request') {
      return renderRequestItem({ item: item.data as FriendRequest });
    } else {
      return renderFriendItem({ item: item.data as Friend });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => (navigation as any).navigate('Home')}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Friends</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={handleSearchInputChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          
          {/* Search Results Dropdown */}
          {showSearchResults && (
            <View style={styles.searchResultsContainer}>
              {isSearching ? (
                <View style={styles.searchLoadingContainer}>
                  <Text style={styles.searchLoadingText}>Searching...</Text>
                </View>
              ) : searchResults.length > 0 ? (
                <FlatList
                  data={searchResults}
                  renderItem={renderSearchResultItem}
                  keyExtractor={(item, index) => `search-${item.id}-${index}`}
                  style={styles.searchResultsList}
                  showsVerticalScrollIndicator={false}
                />
              ) : (
                <View style={styles.searchEmptyContainer}>
                  <Text style={styles.searchEmptyText}>No users found</Text>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'friends' && styles.activeTab]}
            onPress={() => setActiveTab('friends')}
          >
            <Text style={[styles.tabText, activeTab === 'friends' && styles.activeTabText]}>
              Friends
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'gameInvites' && styles.activeTab]}
            onPress={() => setActiveTab('gameInvites')}
          >
            <View style={styles.tabWithBadge}>
              <Text style={[styles.tabText, activeTab === 'gameInvites' && styles.activeTabText]}>
                Game Invites
              </Text>
              {unacceptedChallengesCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unacceptedChallengesCount > 99 ? '99+' : unacceptedChallengesCount}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {activeTab === 'friends' ? (
            loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={combinedData}
                renderItem={renderCombinedItem}
                keyExtractor={(item, index) => {
                  if (item.type === 'request') {
                    return `request-${(item.data as FriendRequest).request_id}-${index}`;
                  } else {
                    return `friend-${(item.data as Friend).friend_id}-${index}`;
                  }
                }}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No friends or requests yet</Text>
                    <Text style={styles.emptySubtext}>Add friends to start playing!</Text>
                  </View>
                }
              />
            )
          ) : (
            loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={duelInvitations}
                renderItem={renderDuelInvitationItem}
                keyExtractor={(item) => `duel-${item.id}`}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No game invites yet</Text>
                    <Text style={styles.emptySubtext}>Duel invitations will appear here</Text>
                  </View>
                }
              />
            )
          )}
        </View>
      </View>

      {/* Game Mode Selection Modal */}
      <Modal
        visible={showGameModeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGameModeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Choose Game Mode</Text>
            <Text style={styles.modalSubtitle}>
              How do you want to duel with @{selectedFriend?.username}?
            </Text>
            <View style={styles.tokenRequirementContainer}>
              <Text style={styles.tokenRequirementText}>
                🪙 Cost: 1 token per duel
              </Text>
              <Text style={styles.tokenBalanceText}>
                Your tokens: {userInfo?.game_tokens || 0}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.gameModeButton}
              onPress={() => handleGameModeSelection('doodleDuel')}
            >
              <Text style={styles.gameModeEmoji}>🎨</Text>
              <Text style={styles.gameModeTitle}>DoodleDuel</Text>
              <Text style={styles.gameModeDescription}>
                Draw the same word and see who's drawing is better!
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gameModeButton}
              onPress={() => handleGameModeSelection('doodleHunt')}
            >
              <Text style={styles.gameModeEmoji}>🔍</Text>
              <Text style={styles.gameModeTitle}>DoodleHunt</Text>
              <Text style={styles.gameModeDescription}>
                Draw and let AI guess what you're drawing!
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowGameModeModal(false);
                setSelectedFriend(null);
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 15,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  searchContainer: {
    marginBottom: 20,
  },
  searchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 20,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#007AFF',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  activeTabText: {
    color: '#fff',
  },
  tabWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContainer: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 2,
  },
  email: {
    fontSize: 12,
    color: '#666',
  },
  acceptButton: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 5,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  // Request item styles
  requestTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  friendTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  requestButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  declineButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  declineButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  // Search Results Styles
  searchResultsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchResultsList: {
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchLoadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  searchLoadingText: {
    fontSize: 14,
    color: '#666',
  },
  searchEmptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  searchEmptyText: {
    fontSize: 14,
    color: '#666',
  },
  // Search button styles
  searchAddFriendButton: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchAddFriendButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchRequestSentButton: {
    backgroundColor: '#FF9500',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchRequestSentButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchAcceptButton: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchAcceptButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchFriendsButton: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchFriendsButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  searchLoadingButton: {
    backgroundColor: '#8E8E93',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchLoadingButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Duel button styles
  duelButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  duelButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  tokenRequirementContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  tokenRequirementText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
    marginBottom: 4,
  },
  tokenBalanceText: {
    fontSize: 12,
    color: '#666',
  },
  gameModeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  comingSoonButton: {
    backgroundColor: '#8E8E93',
  },
  gameModeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  gameModeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  gameModeDescription: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  // Duel Invitation Styles
  duelInvitationItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  completedWin: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  completedLoss: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  duelInvitationInfo: {
    marginBottom: 12,
  },
  duelInvitationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  duelInvitationDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  duelInvitationTime: {
    fontSize: 12,
    color: '#999',
  },
  duelInvitationActions: {
    alignItems: 'flex-end',
  },
  duelActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  declineDuelButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  declineDuelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptDuelButton: {
    backgroundColor: '#34C759',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  acceptDuelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tapToContinueText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  pendingText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
});
