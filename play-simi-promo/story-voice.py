"""Speaks the lines in story-voice.json into assets/voice/<id>.mp3 for story.html.

ElevenLabs (used when a key is present):
    put the API key in .elevenlabs-key in this folder, or in ELEVENLABS_API_KEY
    python3 story-voice.py --find          # list Singaporean voices in the Voice Library
    python3 story-voice.py --narrator <voice id> --kid <voice id>
    python3 story-voice.py shout aim       # only these lines (the voice ids are remembered)

Without a key it falls back to Microsoft's Singapore English voices
(pip install edge-tts). Either way the text is sent to that online service.
When each line plays is set in story.html (CONFIG.voice).
"""
import argparse, json, os, pathlib, sys, urllib.parse, urllib.request

here = pathlib.Path(__file__).parent
out = here / "assets" / "voice"
out.mkdir(parents=True, exist_ok=True)
lines = json.loads((here / "story-voice.json").read_text())
key_file, ids_file = here / ".elevenlabs-key", here / ".elevenlabs-voices.json"
key = os.environ.get("ELEVENLABS_API_KEY") or (key_file.read_text().strip() if key_file.exists() else "")
API = "https://api.elevenlabs.io/v1"

ap = argparse.ArgumentParser()
ap.add_argument("only", nargs="*")
ap.add_argument("--find", action="store_true")
ap.add_argument("--narrator")
ap.add_argument("--kid")
ap.add_argument("--model", default=os.environ.get("ELEVENLABS_MODEL", "eleven_v3"))
ap.add_argument("--accent", help='a v3 tag put in front of every line, e.g. "[strong Singaporean accent]"; "" clears it')
ap.add_argument("--edge", action="store_true", help="use the Microsoft voices even if a key is present")
args = ap.parse_args()

def call(path, body=None):
    req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body else None, headers={"xi-api-key": key, "Content-Type": "application/json"})
    try:
        return urllib.request.urlopen(req).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs said {e.code}: {e.read().decode()[:400]}")

if args.find:
    found = json.loads(call("/shared-voices?" + urllib.parse.urlencode({"search": "singapore", "language": "en", "page_size": 30})))
    for v in found.get("voices", []):
        print(f'{v["voice_id"]}  {v.get("gender", "?"):7} {v.get("age", "?"):12} {v.get("accent", "?"):14} {v["name"]} | {(v.get("description") or "")[:70]}')
        print(f'    preview: {v.get("preview_url")}\n    add:     owner {v.get("public_owner_id")}')
    sys.exit()

if key and not args.edge:
    ids = json.loads(ids_file.read_text()) if ids_file.exists() else {}
    if args.narrator: ids["narrator"] = args.narrator
    if args.kid: ids["kid"] = args.kid
    if "narrator" not in ids: sys.exit("Pick voices first: --find, then --narrator <id> [--kid <id>]")
    ids.setdefault("kid", ids["narrator"])
    if args.accent is not None: ids["accent"] = args.accent
    ids_file.write_text(json.dumps(ids))
    for line in lines:
        if args.only and line["id"] not in args.only: continue
        role = line.get("role", "narrator")
        # "say" is the ElevenLabs wording (it can carry v3 tags such as [shouting]); "text" is the plain one.
        body = {"text": (ids.get("accent", "") + " " + line.get("say", line["text"])).strip(), "model_id": args.model, "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "speed": line.get("speed", 1.0)}}
        (out / (line["id"] + ".mp3")).write_bytes(call(f'/text-to-speech/{ids[role]}?output_format=mp3_44100_128', body))
        print(line["id"])
else:
    import asyncio, edge_tts
    async def main():
        for line in lines:
            if args.only and line["id"] not in args.only: continue
            await edge_tts.Communicate(line["text"], line["voice"], rate=line["rate"], pitch=line["pitch"]).save(str(out / (line["id"] + ".mp3")))
            print(line["id"])
    asyncio.run(main())
