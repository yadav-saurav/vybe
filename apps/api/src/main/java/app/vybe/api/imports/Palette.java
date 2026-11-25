package app.vybe.api.imports;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Artwork palette and image helpers for imported tracks, mirroring the catalog's {@code Artwork}
 * palette: {@code bg} is the cover's dominant colour, {@code text1} is black or white (whichever
 * contrasts more), {@code text2} mixes text1 toward the background, {@code text3} is an accent.
 * Without a cover the palette derives deterministically from a hash of the artist name.
 */
public final class Palette {

    public static final int MAX_COVER = 1000;
    public static final int PLACEHOLDER_SIZE = 600;

    public record Colors(String bg, String text1, String text2, String text3) {
    }

    private Palette() {
    }

    // ------------------------------------------------------------------ palettes

    public static Colors fromImage(BufferedImage img) {
        BufferedImage small = scale(img, 48, 48, true);
        // Dominant colour: 4-bit-per-channel buckets, weighted by count; the winning bucket's mean.
        Map<Integer, long[]> buckets = new HashMap<>();
        for (int y = 0; y < small.getHeight(); y++) {
            for (int x = 0; x < small.getWidth(); x++) {
                int rgb = small.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF, g = (rgb >> 8) & 0xFF, b = rgb & 0xFF;
                int key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                long[] acc = buckets.computeIfAbsent(key, k -> new long[4]);
                acc[0] += r;
                acc[1] += g;
                acc[2] += b;
                acc[3]++;
            }
        }
        long[] best = null;
        for (long[] acc : buckets.values()) {
            if (best == null || acc[3] > best[3]) {
                best = acc;
            }
        }
        int[] bg = best == null ? new int[]{90, 90, 110}
                : new int[]{(int) (best[0] / best[3]), (int) (best[1] / best[3]), (int) (best[2] / best[3])};

        // Accent: the most saturated well-populated bucket that is clearly different from the background.
        int[] accent = null;
        double accentScore = -1;
        int total = small.getWidth() * small.getHeight();
        for (long[] acc : buckets.values()) {
            if (acc[3] < Math.max(2, total / 200)) {
                continue;
            }
            int[] c = {(int) (acc[0] / acc[3]), (int) (acc[1] / acc[3]), (int) (acc[2] / acc[3])};
            if (distance(c, bg) < 60) {
                continue;
            }
            float[] hsb = Color.RGBtoHSB(c[0], c[1], c[2], null);
            double score = hsb[1] * 2 + hsb[2] + Math.log(acc[3]) / 10;
            if (score > accentScore) {
                accentScore = score;
                accent = c;
            }
        }
        return build(bg, accent);
    }

    /** Deterministic palette for a track without cover art. */
    public static Colors fromSeed(String seed) {
        float hue = (hash(seed) % 360) / 360f;
        Color bg = Color.getHSBColor(hue, 0.55f, 0.62f);
        Color accent = Color.getHSBColor((hue + 0.12f) % 1f, 0.6f, 0.9f);
        return build(new int[]{bg.getRed(), bg.getGreen(), bg.getBlue()},
                new int[]{accent.getRed(), accent.getGreen(), accent.getBlue()});
    }

    private static Colors build(int[] bg, int[] accent) {
        int[] black = {0, 0, 0};
        int[] white = {255, 255, 255};
        int[] text1 = contrast(black, bg) >= contrast(white, bg) ? black : white;
        int[] text2 = mix(text1, bg, 0.28);
        int[] text3;
        if (accent != null) {
            // Pull the accent toward text1 until it reads on the background (at least 3:1).
            text3 = accent;
            for (double t = 0; t <= 1.0001 && contrast(text3, bg) < 3; t += 0.1) {
                text3 = mix(accent, text1, t);
            }
        } else {
            text3 = mix(text1, bg, 0.45);
        }
        return new Colors(hex(bg), hex(text1), hex(text2), hex(text3));
    }

    static double contrast(int[] a, int[] b) {
        double la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    private static double luminance(int[] c) {
        double[] v = new double[3];
        for (int i = 0; i < 3; i++) {
            double x = c[i] / 255.0;
            v[i] = x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }

    private static int[] mix(int[] a, int[] b, double t) {
        return new int[]{(int) Math.round(a[0] + (b[0] - a[0]) * t), (int) Math.round(a[1] + (b[1] - a[1]) * t),
                (int) Math.round(a[2] + (b[2] - a[2]) * t)};
    }

    private static double distance(int[] a, int[] b) {
        int dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
        return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    static String hex(int[] c) {
        return String.format("#%02x%02x%02x", clamp(c[0]), clamp(c[1]), clamp(c[2]));
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private static int[] parseHex(String hex) {
        int v = Integer.parseInt(hex.substring(1), 16);
        return new int[]{(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF};
    }

    /** Stable, non-negative FNV-1a hash. */
    static int hash(String s) {
        int h = 0x811c9dc5;
        for (byte b : (s == null ? "" : s.toLowerCase(java.util.Locale.ROOT)).getBytes(StandardCharsets.UTF_8)) {
            h ^= b & 0xFF;
            h *= 16777619;
        }
        return h & 0x7fffffff;
    }

    // ------------------------------------------------------------------ images

    /** Draws {@code img} into an opaque RGB image no larger than {@code max} on its longest side. */
    public static BufferedImage capped(BufferedImage img, int max) {
        int w = img.getWidth(), h = img.getHeight();
        double k = Math.min(1.0, (double) max / Math.max(w, h));
        return scale(img, Math.max(1, (int) Math.round(w * k)), Math.max(1, (int) Math.round(h * k)), false);
    }

    private static BufferedImage scale(BufferedImage img, int w, int h, boolean fast) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.BLACK);
            g.fillRect(0, 0, w, h);
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
                    fast ? RenderingHints.VALUE_INTERPOLATION_BILINEAR : RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g.drawImage(img, 0, 0, w, h, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    public static void writeJpeg(BufferedImage img, OutputStream out) throws IOException {
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpeg");
        if (!writers.hasNext()) {
            throw new IOException("No JPEG encoder");
        }
        ImageWriter writer = writers.next();
        try (ImageOutputStream ios = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(ios);
            ImageWriteParam param = writer.getDefaultWriteParam();
            param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionQuality(0.88f);
            writer.write(null, new IIOImage(img, null, null), param);
        } finally {
            writer.dispose();
        }
    }

    /** A diagonal gradient from the background colour to the accent, with a soft note glyph, as PNG. */
    public static byte[] placeholderPng(String bgHex, String accentHex, int size) {
        BufferedImage img = new BufferedImage(size, size, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            int[] bg = parseHex(bgHex);
            int[] accent = parseHex(accentHex);
            int[] deep = mix(bg, new int[]{0, 0, 0}, 0.35);
            g.setPaint(new GradientPaint(0, 0, toColor(mix(accent, bg, 0.35)), size, size, toColor(deep)));
            g.fillRect(0, 0, size, size);
            // Note glyph on the same 24-unit grid as the web icon set.
            double u = size / 24.0;
            g.setColor(new Color(255, 255, 255, 70));
            g.setStroke(new java.awt.BasicStroke((float) (1.6 * u), java.awt.BasicStroke.CAP_ROUND,
                    java.awt.BasicStroke.JOIN_ROUND));
            java.awt.geom.Path2D stem = new java.awt.geom.Path2D.Double();
            stem.moveTo(10 * u, 15.5 * u);
            stem.lineTo(10 * u, 8.2 * u);
            stem.lineTo(16 * u, 7 * u);
            stem.lineTo(16 * u, 14.3 * u);
            g.draw(stem);
            g.fill(new java.awt.geom.Ellipse2D.Double(6.6 * u, 14 * u, 3.6 * u, 3.0 * u));
            g.fill(new java.awt.geom.Ellipse2D.Double(12.6 * u, 12.8 * u, 3.6 * u, 3.0 * u));
        } finally {
            g.dispose();
        }
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(img, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Color toColor(int[] c) {
        return new Color(clamp(c[0]), clamp(c[1]), clamp(c[2]));
    }
}
