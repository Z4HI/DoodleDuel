#!/bin/bash

# Deploy all Supabase Edge Functions
echo "Deploying Supabase Edge Functions..."

# Deploy matchmaking function
echo "Deploying matchmaking function..."
supabase functions deploy matchmaking

# Deploy other existing functions
echo "Deploying score-drawing-gpt4o function..."
supabase functions deploy score-drawing-gpt4o

echo "Deploying send-friend-request-notification function..."
supabase functions deploy send-friend-request-notification

echo "Deploying duel-notification function..."
supabase functions deploy duel-notification

echo "Deploying duel-accepted-notification function..."
supabase functions deploy duel-accepted-notification

echo "Deploying update-word-of-day function..."
supabase functions deploy update-word-of-day

echo "Deploying guess-drawing function..."
supabase functions deploy guess-drawing

echo "All functions deployed successfully!"