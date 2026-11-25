package app.vybe.api.imports;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sound Check support: measures integrated loudness (EBU R128) with ffmpeg and returns the gain that
 * brings a track to the target level. Only attenuates (players cannot boost above unity volume).
 * Returns null when ffmpeg is unavailable or analysis fails; the track then plays unadjusted.
 */
public final class Loudness {
    private static final Logger log = LoggerFactory.getLogger(Loudness.class);
    static final double TARGET_LUFS = -14.0;
    private static final Pattern INTEGRATED = Pattern.compile("I:\\s+(-?\\d+(?:\\.\\d+)?) LUFS");
    private static final String FFMPEG = findFfmpeg();

    private Loudness() {
    }

    private static String findFfmpeg() {
        String path = System.getenv("PATH");
        if (path == null) return null;
        for (String dir : path.split(java.io.File.pathSeparator)) {
            Path p = Path.of(dir, "ffmpeg");
            if (Files.isExecutable(p)) return p.toString();
        }
        return null;
    }

    /** Gain in dB (<= 0), rounded to 0.1, or null if it cannot be measured. */
    public static Double gainDb(Path audio) {
        if (FFMPEG == null || !Files.isRegularFile(audio)) return null;
        try {
            Process p = new ProcessBuilder(FFMPEG, "-nostats", "-hide_banner", "-i", audio.toString(),
                    "-map", "0:a:0", "-af", "ebur128=framelog=quiet", "-f", "null", "-")
                    .redirectErrorStream(true).start();
            Double lufs = null;
            try (BufferedReader r = new BufferedReader(new InputStreamReader(p.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = r.readLine()) != null) {
                    Matcher m = INTEGRATED.matcher(line);
                    if (m.find()) lufs = Double.parseDouble(m.group(1)); // last match is the summary
                }
            }
            if (!p.waitFor(90, TimeUnit.SECONDS)) { p.destroyForcibly(); return null; }
            return lufs == null ? null : toGain(lufs);
        } catch (Exception e) {
            log.debug("loudness analysis failed for {}: {}", audio.getFileName(), e.toString());
            return null;
        }
    }

    static double toGain(double lufs) {
        double gain = Math.max(-15.0, Math.min(0.0, TARGET_LUFS - lufs));
        return Math.round(gain * 10.0) / 10.0;
    }
}
