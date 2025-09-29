import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch } from '../store/hooks';
import { Friend, FriendRequest, friendsService } from '../store/services/friendsService';
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

export default function DuelFriendScreen() {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchResults, setSearchResults] = useState<UserWithStatus[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Load friends and requests when component mounts
  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  const loadFriends = async () => {
    setLoadingFriends(true);
    try {
      const result = await friendsService.getFriends()(dispatch);
      if (result.success) {
        setFriends(result.data);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoadingFriends(false);
    }
  };

  const loadRequests = async () => {
    setLoadingRequests(true);
    try {
      const result = await friendsService.getPendingRequests()(dispatch);
      console.log('Loaded requests result:', result);
      if (result.success) {
        console.log('Requests data:', result.data);
        setRequests(result.data);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoadingRequests(false);
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

  const handleSearchUserSelect = (user: UserWithStatus) => {
    if (user.friendshipStatus === 'friends') {
      handleDuelFriend(user);
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
        loadFriends();
        loadRequests();
        setSearchQuery(searchQuery); // Trigger search again
      } else {
        Alert.alert('Error', result.error || 'Failed to accept friend request');
      }
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
      // Refresh requests
      loadRequests();
    } else {
      Alert.alert('Error', result.error || 'Failed to decline friend request');
    }
  };

  const handleSearchInputChange = (text: string) => {
    setSearchQuery(text);
    if (text.length < 3) {
      setShowSearchResults(false);
    }
  };

  const handleDuelFriend = (user: User) => {
    Alert.alert(
      'Start Duel',
      `Start a drawing duel with @${user.username}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Duel',
          onPress: () => {
            // TODO: Implement duel functionality
            console.log('Starting duel with:', user);
            Alert.alert('Duel Started!', `Duel with @${user.username} has begun!`);
          },
        },
      ]
    );
  };

  const handleAcceptRequest = (user: User) => {
    Alert.alert(
      'Accept Request',
      `Accept friend request from @${user.username}?`,
      [
        {
          text: 'Decline',
          style: 'cancel',
        },
        {
          text: 'Accept',
          onPress: () => {
            // TODO: Implement accept request functionality
            console.log('Accepting request from:', user);
            Alert.alert('Request Accepted!', `You are now friends with @${user.username}`);
          },
        },
      ]
    );
  };

  const renderFriendItem = ({ item }: { item: Friend }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleDuelFriend({
        id: item.friend_id,
        username: item.username,
        email: item.email
      })}
    >
      <View style={styles.userInfo}>
        <Text style={styles.username}>@{item.username}</Text>
        <Text style={styles.friendTime}>
          Friends since {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.duelButton}>
        <Text style={styles.duelButtonText}>Duel</Text>
      </View>
    </TouchableOpacity>
  );

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
        case 'friends':
          return { text: 'Duel', style: styles.searchDuelButton, textStyle: styles.searchDuelButtonText };
        case 'request_sent':
          return { text: 'Request Sent', style: styles.searchRequestSentButton, textStyle: styles.searchRequestSentButtonText };
        case 'request_received':
          return { text: 'Accept', style: styles.searchAcceptButton, textStyle: styles.searchAcceptButtonText };
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
        disabled={item.friendshipStatus === 'loading'}
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Duel a Friend</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends..."
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
            style={[styles.tab, activeTab === 'requests' && styles.activeTab]}
            onPress={() => setActiveTab('requests')}
          >
            <Text style={[styles.tabText, activeTab === 'requests' && styles.activeTabText]}>
              Requests
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.listContainer}>
          {activeTab === 'friends' ? (
            loadingFriends ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading friends...</Text>
              </View>
            ) : (
              <FlatList
                data={friends}
                renderItem={renderFriendItem}
                keyExtractor={(item, index) => `friend-${item.friend_id}-${index}`}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No friends yet</Text>
                    <Text style={styles.emptySubtext}>Add friends to start dueling!</Text>
                  </View>
                }
              />
            )
          ) : (
            loadingRequests ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Loading requests...</Text>
              </View>
            ) : (
              <FlatList
                data={requests}
                renderItem={renderRequestItem}
                keyExtractor={(item, index) => `request-${item.request_id}-${index}`}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No friend requests</Text>
                    <Text style={styles.emptySubtext}>Friend requests will appear here</Text>
                  </View>
                }
              />
            )
          )}
        </View>
      </View>
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
  duelButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  duelButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
  searchDuelButton: {
    backgroundColor: '#FF6B6B',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchDuelButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
  // New button styles for different friendship statuses
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
});
