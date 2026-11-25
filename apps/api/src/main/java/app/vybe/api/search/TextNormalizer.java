package app.vybe.api.search;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Unicode-normalized, diacritic-free, lower-cased tokens for matching. */
public final class TextNormalizer {

    private static final Pattern MARKS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    private TextNormalizer() {
    }

    /** Lower-cased, diacritics stripped, punctuation collapsed to single spaces. */
    public static String normalize(String s) {
        if (s == null) {
            return "";
        }
        String decomposed = Normalizer.normalize(s, Normalizer.Form.NFKD);
        String noMarks = MARKS.matcher(decomposed).replaceAll("");
        return NON_WORD.matcher(noMarks.toLowerCase(Locale.ROOT)).replaceAll(" ").trim();
    }

    public static String[] tokens(String s) {
        String n = normalize(s);
        if (n.isEmpty()) {
            return new String[0];
        }
        List<String> out = new ArrayList<>();
        for (String t : n.split(" ")) {
            if (!t.isEmpty()) {
                out.add(t);
            }
        }
        return out.toArray(new String[0]);
    }

    /**
     * True when {@code a} and {@code b} are within one Damerau edit (insertion, deletion,
     * substitution or adjacent transposition), i.e. optimal-string-alignment distance at most 1.
     */
    public static boolean withinOneEdit(String a, String b) {
        int la = a.length();
        int lb = b.length();
        if (Math.abs(la - lb) > 1) {
            return false;
        }
        if (a.equals(b)) {
            return true;
        }
        if (la == lb) {
            int diff = -1;
            int mismatches = 0;
            for (int i = 0; i < la; i++) {
                if (a.charAt(i) != b.charAt(i)) {
                    mismatches++;
                    if (diff < 0) {
                        diff = i;
                    }
                }
            }
            if (mismatches == 1) {
                return true;
            }
            // adjacent transposition
            return mismatches == 2 && diff + 1 < la
                    && a.charAt(diff) == b.charAt(diff + 1) && a.charAt(diff + 1) == b.charAt(diff)
                    && a.substring(diff + 2).equals(b.substring(diff + 2));
        }
        // one insertion/deletion: align the longer and shorter strings
        String longer = la > lb ? a : b;
        String shorter = la > lb ? b : a;
        int i = 0;
        while (i < shorter.length() && shorter.charAt(i) == longer.charAt(i)) {
            i++;
        }
        return longer.substring(i + 1).equals(shorter.substring(i));
    }
}
