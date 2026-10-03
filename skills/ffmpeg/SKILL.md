---
name: ffmpeg
description: |
  Use this skill whenever a task involves processing audio or video files —
  converting formats, compressing video, extracting audio, trimming clips,
  resizing, normalising loudness, batch processing, or inspecting media metadata.
  Also fires when working on music production pipelines involving stems, lossless
  audio, sample rate conversion, or preparing media assets for web/social.
author: fluxqx
version: 1.0.0
---

# FFmpeg

## Problem

Media file processing — conversion, compression, extraction, trimming, and
inspection — requires a reliable CLI toolchain with consistent command patterns.
FFmpeg 8.1.1 is installed at `/opt/homebrew/bin/ffmpeg` on the Mac Mini
(Apple Silicon, arm64). VideoToolbox hardware acceleration is available for
H.264 and H.265/HEVC encoding.

## Trigger Conditions

- User asks to convert, compress, trim, resize, or extract audio/video
- Task involves changing codec, container, or bitrate
- Batch processing multiple media files
- Inspecting media metadata (codec, duration, bitrate, streams)
- Loudness normalisation or volume adjustment
- Creating GIFs, thumbnails, or frame sequences from video
- Music production: stem handling, lossless conversion, sample rate changes
- Any reference to mp4, mov, mkv, webm, mp3, aac, flac, wav, hevc, h264

## Process

1. **Inspect first** — use `ffprobe` to understand the source file before deciding on output settings
2. **Choose the right operation** — pick the command pattern that matches the task; prefer `-c copy` (lossless remux) when no re-encoding is needed for speed
3. **Use VideoToolbox** for H.264/H.265 encoding when quality and speed both matter on Apple Silicon
4. **Verify output** — run `ffprobe` on the result to confirm codec, duration, and streams are correct
5. **Batch** — wrap single-file commands in a `for` loop when processing multiple files

## Output

A correctly encoded, converted, or extracted media file at the target path. When inspecting, a human-readable summary of streams, codec, duration, bitrate, and format.

## Notes

- Always quote file paths containing spaces
- Use `-y` to overwrite output without prompting (safe in scripts)
- Add `-v quiet -stats` to suppress verbose output while still showing progress
- For music production: prefer lossless (`-c:a flac` or `-c:a pcm_s24le`) for intermediate files; only compress to lossy at the final delivery step
- VideoToolbox (`-c:v h264_videotoolbox` / `hevc_videotoolbox`) is hardware-accelerated but has fewer filter options than software encoders — use software (`libx264` / `libx265`) when applying complex filter chains
- The `loudnorm` filter requires two passes for broadcast-compliant LUFS targeting

---

## Inspect with ffprobe

```bash
# Full metadata summary (human readable)
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4 | jq .

# Quick one-liner: codec, duration, bitrate
ffprobe -v error -show_entries format=duration,bit_rate -show_entries stream=codec_name,codec_type -of default=noprint_wrappers=1 input.mp4

# Check audio stream only
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,bit_rate -of default=noprint_wrappers=1 input.mp4

# Check video stream only
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate -of default=noprint_wrappers=1 input.mp4
```

---

## Format Conversion (container remux — no re-encode)

```bash
# mp4 → mkv (copy all streams, no quality loss, very fast)
ffmpeg -i input.mp4 -c copy output.mkv

# mov → mp4 (copy streams)
ffmpeg -i input.mov -c copy output.mp4

# Extract audio stream as-is (no re-encode)
ffmpeg -i input.mp4 -vn -c:a copy output.aac
```

---

## Video Compression

### H.264 — Software (libx264)
```bash
# CRF 23 = default quality; lower = better quality, larger file (range 0–51)
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 192k output.mp4

# High quality for archival (crf 18, slow preset)
ffmpeg -i input.mp4 -c:v libx264 -crf 18 -preset slow -c:a copy output.mp4

# Web-optimised (fast start, streaming-friendly)
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -movflags +faststart -c:a aac -b:a 128k output.mp4
```

### H.264 — Hardware (VideoToolbox, Apple Silicon — fast)
```bash
ffmpeg -i input.mp4 -c:v h264_videotoolbox -b:v 8M -c:a aac -b:a 192k output.mp4

# Quality-based (0–100, higher = better)
ffmpeg -i input.mp4 -c:v h264_videotoolbox -q:v 60 -c:a aac -b:a 192k output.mp4
```

### H.265/HEVC — Software (libx265)
```bash
# ~50% smaller than H.264 at equivalent quality
ffmpeg -i input.mp4 -c:v libx265 -crf 28 -preset medium -c:a aac -b:a 192k output.mp4

# Tag for QuickTime/macOS compatibility
ffmpeg -i input.mp4 -c:v libx265 -crf 28 -tag:v hvc1 -c:a aac -b:a 192k output.mp4
```

### H.265/HEVC — Hardware (VideoToolbox)
```bash
ffmpeg -i input.mp4 -c:v hevc_videotoolbox -b:v 6M -tag:v hvc1 -c:a aac -b:a 192k output.mp4
```

### Target file size (two-pass)
```bash
# Target ~100MB for a 60-second clip: bitrate = (100*8192) / 60 ≈ 13650 kbps
ffmpeg -i input.mp4 -c:v libx264 -b:v 13000k -pass 1 -an -f null /dev/null
ffmpeg -i input.mp4 -c:v libx264 -b:v 13000k -pass 2 -c:a aac -b:a 192k output.mp4
```

---

## Audio Conversion & Extraction

```bash
# Video → MP3
ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 output.mp3   # VBR ~190kbps
ffmpeg -i input.mp4 -vn -c:a libmp3lame -b:a 320k output.mp3  # CBR 320k

# Video → AAC
ffmpeg -i input.mp4 -vn -c:a aac -b:a 256k output.aac

# Video → FLAC (lossless)
ffmpeg -i input.mp4 -vn -c:a flac output.flac

# Video → WAV (uncompressed PCM)
ffmpeg -i input.mp4 -vn -c:a pcm_s24le -ar 48000 output.wav   # 24-bit 48kHz

# Any audio → WAV 44.1kHz 16-bit (CD quality)
ffmpeg -i input.flac -c:a pcm_s16le -ar 44100 output.wav

# MP3 → FLAC
ffmpeg -i input.mp3 -c:a flac output.flac

# Sample rate conversion
ffmpeg -i input.wav -ar 48000 output_48k.wav
ffmpeg -i input.wav -ar 44100 output_44k.wav
```

---

## Trimming & Cutting

```bash
# Cut from 00:01:30 to 00:03:00 (copy — no re-encode, instant)
ffmpeg -ss 00:01:30 -to 00:03:00 -i input.mp4 -c copy output.mp4

# Cut 90 seconds starting at 1:30 (duration)
ffmpeg -ss 00:01:30 -t 90 -i input.mp4 -c copy output.mp4

# Precise cut with re-encode (avoids keyframe alignment issues)
ffmpeg -ss 00:01:30 -to 00:03:00 -i input.mp4 -c:v libx264 -crf 23 -c:a copy output.mp4

# Remove first 10 seconds
ffmpeg -ss 10 -i input.mp4 -c copy output.mp4

# Keep only first 30 seconds
ffmpeg -i input.mp4 -t 30 -c copy output.mp4
```

---

## Scaling & Resolution

```bash
# Scale to 1080p width, preserve aspect ratio
ffmpeg -i input.mp4 -vf "scale=1920:-2" -c:v libx264 -crf 23 -c:a copy output.mp4

# Scale to 720p
ffmpeg -i input.mp4 -vf "scale=1280:-2" -c:v libx264 -crf 23 -c:a copy output.mp4

# Scale to 1080p height (portrait/vertical)
ffmpeg -i input.mp4 -vf "scale=-2:1920" -c:v libx264 -crf 23 -c:a copy output.mp4

# Scale to exact dimensions (may change aspect ratio)
ffmpeg -i input.mp4 -vf "scale=1920:1080" -c:v libx264 -crf 23 -c:a copy output.mp4

# Downscale only if larger (never upscale)
ffmpeg -i input.mp4 -vf "scale='min(1920,iw)':-2" -c:v libx264 -crf 23 -c:a copy output.mp4

# Crop to 16:9 from centre
ffmpeg -i input.mp4 -vf "crop=in_w:in_w*9/16" -c:v libx264 -crf 23 -c:a copy output.mp4
```

---

## Audio Volume & Loudness

```bash
# Increase volume by 6dB
ffmpeg -i input.mp4 -af "volume=6dB" -c:v copy output.mp4

# Decrease volume by half
ffmpeg -i input.mp4 -af "volume=0.5" -c:v copy output.mp4

# Detect current loudness (LUFS)
ffmpeg -i input.mp4 -af loudnorm=print_format=json -f null - 2>&1 | tail -20

# Loudness normalisation to -14 LUFS (streaming standard) — Pass 1: measure
ffmpeg -i input.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1

# Pass 2: apply (replace measured_* values from pass 1 output)
ffmpeg -i input.mp4 -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=-18.2:measured_TP=-3.1:measured_LRA=8.4:measured_thresh=-28.5:offset=0.2:linear=true" -c:v copy output_normalised.mp4

# Audio normalisation only (no video)
ffmpeg -i input.mp3 -af loudnorm=I=-14:TP=-1.5:LRA=11 output_normalised.mp3
```

---

## GIF & Thumbnails

```bash
# Extract single frame at 5 seconds
ffmpeg -ss 5 -i input.mp4 -frames:v 1 thumbnail.jpg

# Extract frame sequence (1 per second)
ffmpeg -i input.mp4 -vf fps=1 frames/frame_%04d.jpg

# High-quality GIF (palette method)
ffmpeg -i input.mp4 -vf "fps=15,scale=640:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i input.mp4 -i palette.png -vf "fps=15,scale=640:-1:flags=lanczos,paletteuse" output.gif

# GIF from 5s to 10s
ffmpeg -ss 5 -t 5 -i input.mp4 -vf "fps=15,scale=480:-1:flags=lanczos,palettegen" palette.png
ffmpeg -ss 5 -t 5 -i input.mp4 -i palette.png -vf "fps=15,scale=480:-1:flags=lanczos,paletteuse" output.gif
```

---

## Concatenation

```bash
# Create file list
cat > filelist.txt <<EOF
file 'part1.mp4'
file 'part2.mp4'
file 'part3.mp4'
EOF

# Concat (all files must have same codec, resolution, frame rate)
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4

# Concat with re-encode (for mixed sources)
ffmpeg -f concat -safe 0 -i filelist.txt -c:v libx264 -crf 23 -c:a aac -b:a 192k output.mp4
```

---

## Batch Processing

```bash
# Convert all .mov files to .mp4 in current directory
for f in *.mov; do
  ffmpeg -i "$f" -c:v libx264 -crf 23 -c:a aac -b:a 192k "${f%.mov}.mp4"
done

# Extract audio from all .mp4 files
for f in *.mp4; do
  ffmpeg -i "$f" -vn -c:a flac "${f%.mp4}.flac"
done

# Compress all .wav to .mp3 320k
for f in *.wav; do
  ffmpeg -i "$f" -c:a libmp3lame -b:a 320k "${f%.wav}.mp3"
done

# Batch trim — remove first 10 seconds from all mp4s
for f in *.mp4; do
  ffmpeg -ss 10 -i "$f" -c copy "trimmed_$f"
done

# Batch resize to 1080p
for f in *.mp4; do
  ffmpeg -i "$f" -vf "scale=1920:-2" -c:v libx264 -crf 23 -c:a copy "1080p_$f"
done
```

---

## Music Production Patterns

```bash
# Lossless stem bounce (24-bit WAV from DAW export)
ffmpeg -i stem_bass.aif -c:a pcm_s24le -ar 48000 stem_bass_48k.wav

# Stereo interleave: combine two mono files into stereo
ffmpeg -i left.wav -i right.wav -filter_complex "[0:a][1:a]amerge=inputs=2,pan=stereo|c0=c0|c1=c1" output_stereo.wav

# Split stereo to dual mono
ffmpeg -i stereo.wav -map_channel 0.0.0 left.wav -map_channel 0.0.1 right.wav

# Check for clipping / true peak
ffmpeg -i input.wav -af "volumedetect" -f null - 2>&1 | grep -E "max_volume|mean_volume"

# Convert sample rate with high-quality resampler
ffmpeg -i input_44k.wav -af aresample=resampler=swr -ar 48000 output_48k.wav

# Trim silence from start/end
ffmpeg -i input.wav -af silenceremove=start_periods=1:start_silence=0.1:start_threshold=-50dB:stop_periods=1:stop_silence=0.5:stop_threshold=-50dB output_trimmed.wav
```

---

## Progress & Scripting Flags

```bash
# Show progress without verbose output
ffmpeg -v quiet -stats -i input.mp4 -c:v libx264 -crf 23 output.mp4

# Overwrite output without prompting (use in scripts)
ffmpeg -y -i input.mp4 -c copy output.mp4

# Suppress all output except errors
ffmpeg -v error -i input.mp4 -c copy output.mp4

# JSON progress to stdout (for scripting)
ffmpeg -i input.mp4 -c:v libx264 -crf 23 output.mp4 -progress pipe:1 -v quiet
```
