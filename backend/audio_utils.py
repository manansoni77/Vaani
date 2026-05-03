import asyncio
import subprocess
import wave

AUDIO_DIR = "audio"
PCM_SAMPLE_RATE = 16000  # Hz — must match AudioContext sampleRate on frontend


def save_wav(chunks: list[bytes], path: str, sample_rate: int = PCM_SAMPLE_RATE) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        for chunk in chunks:
            w.writeframes(chunk)


def build_ffmpeg_cmd(
    base_path: str,
    overlays: list[tuple[float, str]],
    output_path: str,
) -> list[str]:
    cmd = ["ffmpeg", "-y", "-i", base_path]
    for _, wav_path in overlays:
        cmd += ["-i", wav_path]

    mix_inputs = ["[0:a]"]
    filter_parts = []
    for i, (t_s, _) in enumerate(overlays):
        t_ms = int(t_s * 1000)
        label = f"[o{i}]"
        filter_parts.append(f"[{i + 1}:a]adelay={t_ms}:all=1{label}")
        mix_inputs.append(label)

    n = len(overlays) + 1
    filter_parts.append(
        f"{''.join(mix_inputs)}amix=inputs={n}:duration=first:dropout_transition=0:normalize=0[out]"
    )
    cmd += ["-filter_complex", ";".join(filter_parts), "-map", "[out]", output_path]
    return cmd


async def mix_audio(
    base_path: str,
    overlays: list[tuple[float, str]],
    output_path: str,
    log,
) -> bool:
    cmd = build_ffmpeg_cmd(base_path, overlays, output_path)
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lambda: subprocess.run(cmd, capture_output=True)
        )
        return result.returncode == 0
    except FileNotFoundError:
        log.warning("ffmpeg not found — skipping mixed audio output")
        return False
