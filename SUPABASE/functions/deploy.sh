#!/bin/bash

# Deploy Supabase Edge Functions
# Make sure you have the Supabase CLI installed and are logged in

echo "🚀 Deploying Supabase Edge Functions..."

# Deploy the friend request notification function
echo "📱 Deploying send-friend-request function..."
supabase functions deploy send-friend-request

if [ $? -eq 0 ]; then
    echo "✅ send-friend-request function deployed successfully!"
else
    echo "❌ Failed to deploy send-friend-request function"
    exit 1
fi

echo "🎉 All functions deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Make sure your Supabase project has the functions enabled"
echo "2. Test the function by sending a friend request"
echo "3. Check the function logs in your Supabase dashboard"
