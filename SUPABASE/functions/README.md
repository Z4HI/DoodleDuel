# Supabase Edge Functions

This directory contains Supabase Edge Functions for the Doodle Duel app.

## Functions

### `send-friend-request`

Sends push notifications when friend requests are sent.

**Endpoint**: `https://your-project.supabase.co/functions/v1/send-friend-request`

**Method**: POST

**Body**:
```json
{
  "sender_id": "uuid",
  "receiver_id": "uuid"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Friend request notification sent",
  "expoResult": { ... }
}
```

## Deployment

### Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

### Deploy Functions

Run the deployment script:
```bash
./deploy.sh
```

Or deploy individually:
```bash
supabase functions deploy send-friend-request
```

### Environment Variables

Make sure these are set in your Supabase project:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_ANON_KEY`: Your Supabase anonymous key

## Testing

Test the function locally:
```bash
supabase functions serve send-friend-request
```

Test with curl:
```bash
curl -X POST 'http://localhost:54321/functions/v1/send-friend-request' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"sender_id": "uuid", "receiver_id": "uuid"}'
```

## Monitoring

Check function logs in your Supabase dashboard:
1. Go to Functions tab
2. Click on the function name
3. View logs and metrics

## Troubleshooting

### Common Issues

1. **Function not found**: Make sure the function is deployed
2. **Permission denied**: Check RLS policies
3. **Push notification fails**: Verify Expo push tokens are valid
4. **CORS errors**: Check the CORS headers in the function

### Debug Mode

Enable debug logging by adding console.log statements in the function code.
