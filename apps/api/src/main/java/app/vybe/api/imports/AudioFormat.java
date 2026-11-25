package app.vybe.api.imports;

import java.util.Locale;
import java.util.Optional;

/**
 * The audio formats Vybe accepts for import. Each one is checked twice: by file extension and by
 * the file's leading magic bytes, so a renamed text file or image is rejected.
 */
public enum AudioFormat {
    MP3("audio/mpeg", "mp3"),
    M4A("audio/mp4", "m4a"),
    AAC("audio/aac", "m4a"),
    FLAC("audio/flac", "flac"),
    OGG("audio/ogg", "ogg"),
    OPUS("audio/ogg", null),
    WAV("audio/wav", "wav");

    /** Bytes needed by {@link #matches(byte[])}. */
    public static final int SNIFF_BYTES = 16;

    private final String mime;
    /** The extension jaudiotagger should parse the file as, or null when it cannot (raw Opus). */
    private final String tagReaderExt;

    AudioFormat(String mime, String tagReaderExt) {
        this.mime = mime;
        this.tagReaderExt = tagReaderExt;
    }

    public String mime() {
        return mime;
    }

    public String tagReaderExt() {
        return tagReaderExt;
    }

    /** Lower-case extension of {@code filename} (without the dot), or "" when it has none. */
    public static String extensionOf(String filename) {
        if (filename == null) {
            return "";
        }
        String name = filename.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        int dot = name.lastIndexOf('.');
        return dot < 0 || dot == name.length() - 1 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** The format an extension claims, if it is one Vybe accepts. */
    public static Optional<AudioFormat> forExtension(String ext) {
        return Optional.ofNullable(switch (ext == null ? "" : ext.toLowerCase(Locale.ROOT)) {
            case "mp3" -> MP3;
            case "m4a" -> M4A;
            case "aac" -> AAC;
            case "flac" -> FLAC;
            case "ogg", "oga" -> OGG;
            case "opus" -> OPUS;
            case "wav" -> WAV;
            default -> null;
        });
    }

    /** Whether the leading bytes of a file look like this format. */
    public boolean matches(byte[] head) {
        if (head == null || head.length < 4) {
            return false;
        }
        return switch (this) {
            case MP3 -> startsWith(head, "ID3") || isMpegFrameSync(head);
            // Raw ADTS AAC, ID3-prefixed ADTS, or AAC in an MP4 container saved as .aac.
            case AAC -> startsWith(head, "ID3") || isAdts(head) || isMp4(head);
            case M4A -> isMp4(head);
            // FLAC may carry a (non-standard) ID3v2 prefix.
            case FLAC -> startsWith(head, "fLaC") || startsWith(head, "ID3");
            case OGG, OPUS -> startsWith(head, "OggS");
            case WAV -> head.length >= 12 && startsWith(head, "RIFF") && ascii(head, 8, "WAVE");
        };
    }

    private static boolean isMp4(byte[] h) {
        return h.length >= 8 && ascii(h, 4, "ftyp");
    }

    private static boolean isMpegFrameSync(byte[] h) {
        // 11 sync bits, and a layer field that is not "reserved" (00); ADTS uses layer 00, so it is excluded.
        return (h[0] & 0xFF) == 0xFF && (h[1] & 0xE0) == 0xE0 && (h[1] & 0x06) != 0;
    }

    private static boolean isAdts(byte[] h) {
        return (h[0] & 0xFF) == 0xFF && (h[1] & 0xF6) == 0xF0;
    }

    private static boolean startsWith(byte[] h, String magic) {
        return ascii(h, 0, magic);
    }

    private static boolean ascii(byte[] h, int offset, String magic) {
        if (h.length < offset + magic.length()) {
            return false;
        }
        for (int i = 0; i < magic.length(); i++) {
            if (h[offset + i] != (byte) magic.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}
