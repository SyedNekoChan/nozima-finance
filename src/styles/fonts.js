/*
 * Self-hosted type (no third-party font request at runtime). One family:
 *
 *   Geist        every word and every figure (variable 100–900, tabular numerals)
 *   Geist Mono   technical metadata only: currency codes, the clock, the note
 *
 * Both cover Latin and Cyrillic; each subset loads only when its glyphs are used.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
