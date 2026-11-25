package app.vybe.api.common;

import java.security.SecureRandom;

/** Random, URL-safe identifiers with a readable prefix (e.g. {@code pl_u_k3j9x0a2b7qz}). */
public final class Ids {

    private static final char[] ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {
    }

    public static String random(String prefix, int length) {
        StringBuilder sb = new StringBuilder(prefix.length() + length).append(prefix);
        for (int i = 0; i < length; i++) {
            sb.append(ALPHABET[RANDOM.nextInt(ALPHABET.length)]);
        }
        return sb.toString();
    }
}
