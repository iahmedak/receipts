# Builds docs/demo.mp4 from the README screenshots.
# Requires ffmpeg on PATH and Windows Speech (System.Speech) for narration.
# Run from the repository root: powershell -File scripts/make-video.ps1

Add-Type -AssemblyName System.Speech

$ErrorActionPreference = "Continue"
$PSNativeCommandUseErrorActionPreference = $false
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

$scenes = @(
  @{
    image = "docs/home.jpeg"
    dur = 18
    caption = "Most tools find documents. Receipts answers decisions."
    narration = "Most tools can find a document. Receipts answers a harder question: what did your company actually decide, and is it still true? Ask in plain language. Every answer comes from one connected Relate graph."
  },
  @{
    image = "docs/auth-receipt.jpeg"
    dur = 20
    caption = "A receipt: evidence, approver, owner, confidence."
    narration = "Ask about authentication and you get the current decision: migrate to Okta. The receipt shows four pieces of evidence, the CTO who approved it, the owner, and the confidence. Nothing is asserted without a path through the graph."
  },
  @{
    image = "docs/time-travel.jpeg"
    dur = 20
    caption = "Time travel: September 2025 says Auth0."
    narration = "Scrub the timeline back to September 2025. The answer changes to Auth0, and the graph changes with it: decisions, evidence and notes that did not exist yet are pruned away. This is time travel over relationships, not a filtered document list."
  },
  @{
    image = "docs/retention-alert.jpeg"
    dur = 20
    caption = "Current decision. Withdrawn evidence."
    narration = "Now ask about log retention. The answer looks healthy: a current decision, approved, with evidence. But the graph knows something a keyword search does not. The legal memo underneath it was retracted in August."
  },
  @{
    image = "docs/audit.jpeg"
    dur = 22
    caption = "Seven findings a keyword index cannot produce."
    narration = "The audit tab finds what search cannot: one current decision resting on withdrawn evidence, one approved decision with no evidence at all, and five documents that still describe decisions that were replaced."
  },
  @{
    image = "docs/home.jpeg"
    dur = 15
    caption = "Every answer has a receipt. Built on Relate."
    narration = "These are not filters over rows. They are traversals: supersedes, based on, approved, records. Built on Relate, embedded and running in your browser. Every answer has a receipt."
  }
)

$work = Join-Path $env:TEMP "receipts-video"
New-Item -ItemType Directory -Force $work | Out-Null

# Narration, one WAV per scene.
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice("Microsoft David Desktop")
$synth.Rate = 0
$synth.Volume = 100
$wavs = @()
for ($i = 0; $i -lt $scenes.Count; $i++) {
  $wav = Join-Path $work ("voice{0}.wav" -f $i)
  $synth.SetOutputToWaveFile($wav)
  $synth.Speak($scenes[$i].narration)
  $synth.SetOutputToNull()
  $wavs += $wav
}

# Concatenate narration.
$list = Join-Path $work "voice-list.txt"
($wavs | ForEach-Object { "file '$_'" }) -join "`n" | Set-Content -Encoding ascii $list
$voice = Join-Path $work "narration.wav"
& ffmpeg -y -f concat -safe 0 -i $list -c copy $voice 2>$null

# SRT captions, timed to the scene cuts.
$srt = Join-Path $root "docs/captions.srt"
$sb = New-Object System.Text.StringBuilder
$t = 0
for ($i = 0; $i -lt $scenes.Count; $i++) {
  $end = $t + $scenes[$i].dur
  $fmt = { param($x) ("{0:00}:{1:00}:{2:00},{3:000}" -f [math]::Floor($x / 3600), [math]::Floor(($x % 3600) / 60), [math]::Floor($x % 60), [math]::Floor(($x % 1) * 1000)) }
  [void]$sb.AppendLine("$($i + 1)")
  [void]$sb.AppendLine("$( & $fmt $t ) --> $( & $fmt $end )")
  [void]$sb.AppendLine($scenes[$i].caption)
  [void]$sb.AppendLine()
  $t = $end
}
$sb.ToString() | Set-Content -Encoding utf8 $srt

# One video segment per scene: slow zoom, 1280x720, 25 fps.
$segments = @()
for ($i = 0; $i -lt $scenes.Count; $i++) {
  $scene = $scenes[$i]
  $out = Join-Path $work ("scene{0}.mp4" -f $i)
  $vf = "scale=1280:720,fps=25,format=yuv420p"
  & ffmpeg -y -loop 1 -t $scene.dur -i $scene.image -vf $vf -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -an $out 2>$null
  $segments += $out
}

$segList = Join-Path $work "segment-list.txt"
($segments | ForEach-Object { "file '$_'" }) -join "`n" | Set-Content -Encoding ascii $segList
$silent = Join-Path $work "silent.mp4"
& ffmpeg -y -f concat -safe 0 -i $segList -c copy $silent 2>$null

$subFilter = "subtitles=docs/captions.srt:force_style='FontName=Arial,FontSize=13,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=22'"
& ffmpeg -y -i $silent -i $voice -vf $subFilter -af apad -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest docs/demo.mp4 2>$null

if (Test-Path docs/demo.mp4) {
  $f = Get-Item docs/demo.mp4
  "Built docs/demo.mp4 ($([math]::Round($f.Length / 1MB, 1)) MB)"
} else {
  throw "ffmpeg did not produce docs/demo.mp4"
}
