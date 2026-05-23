# Voice Interaction Implementation Notes

Temporary working notes for the DuroMoney / FinAI voice experiment.

## Goal

Add a premium-feeling voice loop for demos and recruiter presentations while keeping cost and abuse risk controlled.

Target experience:

1. User presses the microphone.
2. User asks a financial question by voice.
3. The UI transcribes the question in the input.
4. When speech stops, the question is submitted automatically.
5. The AI response appears in the console.
6. If the question came from voice, the answer is read aloud automatically.

## Current Frontend Flow

File: `components/AIConsole.tsx`

Implemented controls:

- Dark microphone button: captures voice input through browser speech recognition.
- Light message/voice button: reads the current AI response.
- Green send button: sends typed input manually.

Implemented behavior:

- Uses browser `SpeechRecognition` / `webkitSpeechRecognition` for speech-to-text.
- Shows interim transcript in the text input while the user speaks.
- Sends the recognized query automatically when final speech is detected.
- Also sends automatically after a short silence window when a transcript exists.
- Keeps a 12 second maximum listening timeout so the red/listening state does not hang forever.
- If browser speech recognition is unavailable, the mic falls back to reading the existing response.
- When a voice-submitted query returns, the next response is read aloud automatically.
- Manual audio playback is blocked from stacking multiple overlapping audio streams.

Important implementation details:

- `onVoiceSubmit(query)` bypasses the normal form state timing issue. This avoids submitting an empty query before React has applied `setUserQuery`.
- `autoSpeakNextResponse` tells the console to read the next completed response.
- `spokenResponseRef` prevents auto-reading the same response repeatedly.
- `isSpeakingRef` and `isPreparingVoiceRef` prevent fast repeated clicks from spawning duplicate audio.
- `cleanSpokenText()` removes console prefixes before speech, including:
  - `SYSTEM_ANALYSIS_COMPLETE:`
  - `ANALISIS_COMPLETO:`
  - `ANÁLISIS_COMPLETO:`
  - `RESPUESTA_IA:`
  - `AI_RESPONSE:`
  - `ERROR:`
  - `⚡`

## Current Backend Flow

File: `backend/lambda_function.py`

Endpoint:

- `POST ?action=synthesize_voice`

Input:

```json
{
  "text": "Text to synthesize",
  "target_language": "es"
}
```

Output:

```json
{
  "status": "success",
  "data": {
    "audio_base64": "...",
    "content_type": "audio/mpeg",
    "cache_hit": false
  }
}
```

Security and cost control:

- Premium Polly voice is restricted in backend by Cognito email, not just hidden in the UI.
- Allowed emails:
  - `ericridri11@gmail.com`
  - `ericrodriguezpacheco@outlook.com`
- Unauthorized accounts get HTTP 403.
- Text is capped at 900 characters before synthesis.
- Audio is cached in `FinanceAgent-Cache` by text hash + language + voice.
- Cache TTL is 30 days.
- Replaying the same response should not call Polly again.

## AWS Services Used

### Browser Speech Recognition

Used for voice input in the browser.

Cost:

- No AWS cost.
- Browser support varies.
- Chrome-based browsers generally support `webkitSpeechRecognition`; Safari/Firefox support can be limited.

### Amazon Polly

Used for premium text-to-speech output.

Required Lambda IAM permission:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "polly:SynthesizeSpeech",
      "Resource": "*"
    }
  ]
}
```

This has been added as inline policy:

- Role: `FinanceAgent-Brain-role-wdwdwbq7`
- Policy: `FinanceAgent-Polly-SynthesizeSpeech`

## Polly Cost Notes

Official pricing reference: https://aws.amazon.com/polly/pricing/

As of the checked AWS pricing page:

- Standard voices: about `$4 / 1M characters`.
- Neural voices: about `$16 / 1M characters`.
- Generative voices: about `$30 / 1M characters`.

Approximate per-response cost:

- 400 characters with neural voice: `400 / 1,000,000 * 16 = $0.0064`.
- 400 characters with generative voice: `400 / 1,000,000 * 30 = $0.012`.

For demo use with one or two live questions, this is negligible, especially while AWS credits/free tier apply. The real risk is public abuse at scale, which is why backend email gating and audio caching are mandatory.

## Spanish Voice Notes

Official voices reference: https://docs.aws.amazon.com/polly/latest/dg/available-voices.html

Spanish Spain voices listed by AWS include:

- Conchita, female
- Lucia, female
- Alba, female
- Enrique, male
- Sergio, male
- Raul/Raúl, male

AWS documentation also lists generative Spanish Spain voices including:

- Lucia, female
- Sergio, male

Observation from testing:

- Local development may sound more fluent because it can use the operating system/browser voice.
- The deployed URL may sound different if Polly fails and the browser fallback is used, or if a less suitable voice is selected.
- For a fluent male Spanish voice, `Sergio` should be the preferred candidate to test.

## Recommended Next Steps

1. Add a voice selector in Profile, visible only for premium voice accounts.
2. Persist selected voice in user profile, for example:
   - `preferred_voice_language`
   - `preferred_voice_id`
   - `preferred_voice_engine`
3. Fetch available curated voices from backend rather than trusting arbitrary frontend values.
4. Start with a curated allowlist:
   - Spanish male: `Sergio` neural/generative if available, fallback `Enrique` standard.
   - Spanish female: `Lucia` neural/generative if available, fallback `Conchita` standard.
   - English male: `Matthew` neural, fallback `Joey` standard.
   - English female: `Joanna` neural, fallback `Salli` standard.
5. Add a daily voice budget per premium user:
   - Example: max 30 syntheses/day or max 20,000 characters/day.
6. Add CloudWatch metrics for:
   - `VoiceSynthesisRequest`
   - `VoiceSynthesisCacheHit`
   - `VoiceSynthesisDenied`
   - `VoiceSynthesisFailed`
7. Consider Amazon Transcribe only if browser speech recognition is not reliable enough.

## Known Limitations

- Browser speech recognition is not identical to ChatGPT/Gemini real-time voice. It is browser-dependent and may wait for final recognition unless silence-submit logic catches the transcript.
- Current implementation is turn-based, not full duplex real-time conversation.
- Polly returns complete MP3 audio for a response; it is not currently streamed token-by-token.
- Voice output for local dev and production can differ because local fallback uses the browser/OS voice while production premium attempts Polly first.

## Operational Commands Used

Frontend build:

```bash
npm run build
```

Backend syntax check:

```bash
python3 -m py_compile backend/lambda_function.py backend/scoring.py backend/ai_engine.py
```

Deploy frontend:

```bash
aws s3 sync dist/ s3://finagent-dashboard-eric-2026 --delete
aws cloudfront create-invalidation --distribution-id E4IMHFINBIN5N --paths '/*'
```

Deploy backend:

```bash
cd backend
zip -r deployment.zip lambda_function.py config.py plaid_client.py wise_client.py scoring.py ai_engine.py email_engine.py
aws lambda update-function-code --function-name FinanceAgent-Brain --zip-file fileb://deployment.zip --region eu-north-1
```

