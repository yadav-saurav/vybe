package app.vybe.api.common;

/** Small string helpers for editorial captions. */
public final class Text {

    private Text() {
    }

    /** First sentence of {@code s}, capped at {@code max} characters (ellipsis when cut). */
    public static String firstSentence(String s, int max) {
        if (s == null || s.isBlank()) {
            return "";
        }
        String trimmed = s.trim();
        int end = -1;
        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if ((c == '.' || c == '!' || c == '?') && (i + 1 == trimmed.length() || Character.isWhitespace(trimmed.charAt(i + 1)))) {
                end = i + 1;
                break;
            }
        }
        String sentence = end > 0 ? trimmed.substring(0, end) : trimmed;
        if (sentence.length() <= max) {
            return sentence;
        }
        return sentence.substring(0, Math.max(0, max - 1)).stripTrailing() + "…";
    }
}
