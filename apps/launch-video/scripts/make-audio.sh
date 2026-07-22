#!/usr/bin/env bash
# Procedural sound bed for the launch video variants. Everything is
# synthesized locally with ffmpeg: a low drone, noise risers into the big
# transitions, soft sub thumps on section boundaries, and a quiet chord
# under the icon finale. Timestamps mirror the beat frames in each scene
# file (frames / 30).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/audio
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

R=48000

thump() { # $1 out
  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i "aevalsrc='sin(2*PI*52*t)*exp(-6.5*t)*0.9':s=$R:d=1.2" \
    -af "lowpass=f=140" "$1"
}

riser() { # $1 out, $2 length
  local body
  body=$(awk "BEGIN{printf \"%.3f\", $2-0.35}")
  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i "anoisesrc=color=pink:r=$R:d=$2" \
    -af "highpass=f=300,lowpass=f=1400,afade=t=in:st=0:d=$body,afade=t=out:st=$body:d=0.35,volume=0.5" "$1"
}

make_variant() {
  local name=$1 dur=$2 riser_end=$3 riser_len=$4 chord_at=$5
  shift 5
  local hits=("$@")

  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i "aevalsrc='0.16*sin(2*PI*55*t)+0.12*sin(2*PI*110.4*t)+0.07*sin(2*PI*164.6*t)':s=$R:d=$dur" \
    -af "tremolo=f=0.13:d=0.3,lowpass=f=420,volume=0.7" "$TMP/drone.wav"

  ffmpeg -hide_banner -loglevel error -y -f lavfi \
    -i "aevalsrc='0.11*sin(2*PI*220*t)+0.09*sin(2*PI*277.2*t)+0.07*sin(2*PI*329.6*t)+0.05*sin(2*PI*440*t)':s=$R:d=6" \
    -af "lowpass=f=1000,afade=t=in:st=0:d=1.6,afade=t=out:st=4.4:d=1.6,volume=0.8" "$TMP/chord.wav"

  local inputs=(-i "$TMP/drone.wav")
  local graph="" idx=1 mixidx="[0:a]"

  if [ "$(echo "$riser_len > 0" | bc)" = "1" ]; then
    riser "$TMP/riser.wav" "$riser_len"
    inputs+=(-i "$TMP/riser.wav")
    local rdelay_ms
    rdelay_ms=$(echo "($riser_end-$riser_len)*1000/1" | bc)
    [ "$rdelay_ms" -lt 0 ] && rdelay_ms=0
    graph+="[${idx}:a]adelay=${rdelay_ms}|${rdelay_ms}[r];"
    mixidx+="[r]"
    idx=$((idx+1))
  fi

  thump "$TMP/thump.wav"
  local h n=0
  for h in "${hits[@]}"; do
    inputs+=(-i "$TMP/thump.wav")
    local dms
    dms=$(echo "$h*1000/1" | bc)
    graph+="[${idx}:a]adelay=${dms}|${dms}[h${n}];"
    mixidx+="[h${n}]"
    idx=$((idx+1)); n=$((n+1))
  done

  inputs+=(-i "$TMP/chord.wav")
  local cms
  cms=$(echo "$chord_at*1000/1" | bc)
  graph+="[${idx}:a]adelay=${cms}|${cms}[c];"
  mixidx+="[c]"
  idx=$((idx+1))

  local total=$idx
  graph+="${mixidx}amix=inputs=${total}:normalize=0,loudnorm=I=-21:TP=-2:LRA=9,afade=t=out:st=$(awk "BEGIN{printf \"%.3f\", $dur-1.1}"):d=1.1"

  ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" \
    -filter_complex "$graph" -t "$dur" -ar $R -ac 2 "$OUT/$name.wav"
  echo "made $OUT/$name.wav"
}

#            name        dur    riser_end len  chord   hits...
make_variant TwoWorlds   26.0   7.0       2.6  22.4    7.0 10.17 12.93 16.0 19.17
make_variant Reflex      20.67  3.47      1.6  17.5    3.47 6.8 10.13 13.47
make_variant Receipt     22.0   3.6       1.8  18.4    3.6 10.0 15.27
make_variant LightsOut   20.67  1.93      1.2  17.9    1.93 8.6 15.07
make_variant RasterToVector 20.67 7.0     3.0  17.5    7.0 15.07
