# FFmpeg Skill

> Comprehensive media processing — convert, compress, extract, trim, normalise, and batch process audio and video files.

## What It Does

Provides Claude with ready-to-use FFmpeg command patterns for all common media processing tasks, including Apple Silicon VideoToolbox hardware-accelerated encoding and music-production-specific workflows.

## Supported Clients

- Claude Code
- Cursor
- Codex
- Any AI client that accepts custom instructions / skill files

## Prerequisites

- FFmpeg installed: `brew install ffmpeg`
- Verify: `ffmpeg -version` and `ffprobe -version`
- No API keys or services required

## Installation

1. Copy `SKILL.md` into your Claude Code project (`.claude/skills/ffmpeg.md`) or into the org skills folder for your brain repo
2. Reload / restart the AI client
3. Trigger with any media processing request

## Trigger Conditions

- "convert this video to mp4"
- "compress this file"
- "extract the audio from..."
- "trim the first 10 seconds"
- "normalise the loudness"
- "resize to 1080p"
- Any mention of: ffmpeg, mp4, mov, mkv, h264, hevc, aac, flac, wav, stem, loudnorm

## Expected Outcome

Claude will produce a correct, copy-paste-ready FFmpeg command for the task, using the appropriate flags for the source and target format — and will suggest VideoToolbox hardware acceleration where applicable on Apple Silicon.

## Troubleshooting

**Issue: `No such encoder 'h264_videotoolbox'`**
Solution: Your FFmpeg build doesn't include VideoToolbox. Use software encoder: `-c:v libx264`.

**Issue: Concat produces mismatched streams error**
Solution: All input files must share the same codec, resolution, and frame rate for `-c copy` concat. Add `-c:v libx264 -c:a aac` to re-encode on concat.

**Issue: GIF is huge**
Solution: Use the two-pass palette method in the GIF section — it dramatically reduces file size vs a direct conversion.

**Issue: loudnorm two-pass values**
Solution: Run Pass 1 first, copy the `measured_*` JSON values from its output, paste them into the Pass 2 command exactly.

## Notes for Other Clients

The SKILL.md command reference is plain markdown and works in any client that accepts a system prompt or instruction file. No OB1 or Open Brain dependency.
