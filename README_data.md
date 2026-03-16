# Data Files — Reference

> **Note:** File formats described here are the **target/future canonical format**.
> Some files currently on disk may use an older naming convention
> (e.g. `acp_hc_*`, `top10_pattern_hc_*`). The descriptions below reflect the
> standardised layout that all new outputs should follow.

---

## Directory Layout

```
data/
├── <dataset>/                        # e.g. 14k,  60_cla
│   ├── parameters.json               # study parameters used to generate this dataset
│   ├── taxonomy.csv                  # full taxonomy table for every replicon
│   └── philogenie/
│       └── <taxon_value>/            # e.g. Prokaryote
│           ├── PC{n}_{part}_{taxon_value}.csv
│           ├── acp_{part}_{taxon_value}{replicon_type}.csv
│           ├── explained_variance_ratio_{part}_{taxon_value}{replicon_type}.csv
│           ├── hc_{taxon_value}_{part}_all_data{replicon_type}.csv
│           ├── hc_{taxon_value}_{part}_mean{replicon_type}.csv
│           ├── hc_{taxon_value}_{part}_median{replicon_type}.csv
│           ├── hc_{taxon_value}_{part}_min_max{replicon_type}.csv
│           ├── hc_{taxon_value}_{part}_pattern_count{replicon_type}.csv
│           └── hc_{taxon_value}_{part}_pattern_top10{replicon_type}.csv
```

---

## Shared Variables

These placeholders appear in every file name below.

### `{part}` — genomic region analysed

| Value | Meaning |
|---|---|
| `all` | Complete replicon (all IR occurrences) |
| `cod` | Gene / coding sequences only |
| `non` | Intergenic / non-coding sequences only |

### `{taxon_value}` — taxonomic group

The name of the taxon sub-folder, e.g. `Prokaryote`.  
One sub-folder exists per distinct taxon group in the study.

### `{replicon_type}` — replicon filter suffix

| Value | Meaning |
|---|---|
| *(empty)* | All replicons (chromosomes + plasmids) |
| `_chromosome` | Chromosomes only |
| `_plasmid` | Plasmids only |

### Arm × gap matrix layout

Several files encode a **18 arms × 21 gaps = 378-cell** matrix as a flat vector.
The mapping between flat index and biological parameters is:

```
flat_index  =  col × 21  +  gap
col         =  arm_size − 3       (arm sizes 3 → 20  ↔  cols 0 → 17)
gap         =  gap value          (gaps 0 → 20        ↔  rows 0 → 20)
kmer_length =  arm_size           (pattern length always equals arm size)
```

When displayed as a heatmap: **X-axis = arm size (3→20)**, **Y-axis = gap (0→20)**.  
Cells with no IR data for a given replicon are stored as the sentinel value `'0'`
and should be treated as missing / blank (not zero).

---

## Dataset-Level Files

### `parameters.json`

Study parameters used to produce all files in this dataset folder.

| Field | Example | Description |
|---|---|---|
| `files` | `"ALL_FILES"` | Input file selection mode |
| `min_ir_size` | `3` | Minimum IR arm length (bp) |
| `max_ir_size` | `1000` | Maximum IR arm length (bp) |
| `max_gap` | `20` | Maximum gap between IR arms (bp) |
| `max_mismatch` | `0` | Maximum mismatches allowed in IR arms |
| `sample_size` | `-1` | Number of replicons sampled (−1 = all) |
| `replica_number` | `10` | Number of replicates |
| `split_mode` | `"each_special_R"` | How replicons are split for analysis |
| `n_jobs` | `32` | Parallel jobs used during computation |

---

### `taxonomy.csv`

Full taxonomy + replicon metadata for every replicon in the dataset.
One row per replicon.

**Columns (13):**

| Column | Description |
|---|---|
| `Superdomain` | e.g. `Prokaryote` |
| `Domain` | e.g. `Bacteria`, `Archaea` |
| `Phylum` | e.g. `Bacillota` |
| `Class` | e.g. `Bacilli` |
| `Order` | e.g. `Lactobacillales` |
| `Family` | e.g. `Streptococcaceae` |
| `Genus` | e.g. `Streptococcus` |
| `Species` | e.g. `Streptococcus thermophilus` |
| `ID` | NCBI assembly accession, e.g. `GCA_000492175.2_ASM49217v2` |
| `full_name` | Organism display name |
| `Replicons_name` | GenBank sequence accession, e.g. `CP097573.1` |
| `Replicons_type` | `chromosome` or `plasmid` |
| `ID-replicon` | Unique replicon key used as row identifier in all other files, format `{type}_{assembly_ID}` |

---

## Phylogenie Files

---

### PC heatmap files

**File format:** `PC{n}_{part}_{taxon_value}.csv`  
**Example:** `PC0_cod_Prokaryote.csv`

**Data:** The mean HC score contribution of principal component `n` projected back onto
the arm × gap parameter space, for a single PC.  
Used to visualise which (arm, gap) bins drive each PC.

**Shape:** 21 rows × 19 columns (21 gaps × 18 arm sizes + 1 label column)

| Dimension | Values |
|---|---|
| Rows | Gap values 0 → 20 (row label = gap index as integer) |
| Columns | Arm sizes 3 → 20 (column label = arm size as integer); first col is the row-label column (empty header) |
| Cell value | Floating-point PC weight for that (arm, gap) bin |

> `{n}` ranges from `0` to `9` (PC0 → PC9, corresponding to PC1–PC10 in the PCA output).

---

### PCA scatter points

**File format:** `acp_{part}_{taxon_value}{replicon_type}.csv`  
**Example:** `acp_cod_Prokaryote_chromosome.csv`

**Data:** One row per replicon. Contains the 10 PCA coordinates of each replicon
in the reduced space, plus all taxonomic and genomic metadata needed for scatter
plot colouring, sizing, and filtering.

**Shape:** one row per replicon (~14 065 for the `14k` dataset)

**Columns (32):**

| Column(s) | Description |
|---|---|
| `PC1` … `PC10` | PCA scores on principal components 1–10 (floating-point) |
| `Superdomain`, `Domain`, `Phylum`, `Class`, `Order`, `Family`, `Genus`, `Species` | Taxonomic ranks |
| `ID` | NCBI assembly accession |
| `full_name` / `fullname` | Organism display name |
| `Replicons_name` | GenBank sequence accession |
| `Replicons_type` | `chromosome` or `plasmid` |
| `ID-replicon` | Unique replicon key (primary join key across all files) |
| `GC` | GC content (fraction 0–1) |
| `size` | Total replicon size (bp) |
| `Coding size` | Total coding sequence length (bp) |
| `Non-coding size` | Total non-coding sequence length (bp) |
| `coding_percentage` | `Coding size / size × 100` |
| `non_coding_percentage` | `Non-coding size / size × 100` |
| `overlap` | Overlap between coding and non-coding annotations (bp, can be negative) |
| `overlap_percentage` | `overlap / size × 100` |

---

### PCA explained variance

**File format:** `explained_variance_ratio_{part}_{taxon_value}{replicon_type}.csv`  
**Example:** `explained_variance_ratio_cod_Prokaryote_chromosome.csv`

**Data:** Per-PC explained variance fraction from the PCA decomposition.

**Shape:** 10 rows (one per PC) × 3 columns

**Columns:**

| Column | Description |
|---|---|
| `PC` | PC label (`PC1` … `PC10`) |
| `explained_variance_ratio` | Fraction of total variance explained by this PC (0–1) |
| `cumulative_explained_variance` | Running cumulative sum of the above |

---

### Vectorised heatmap of all replicons (PCA input)

**File format:** `hc_{taxon_value}_{part}_all_data{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_all_data_chromosome.csv`

**Data:** The raw HC score vector for every replicon — this is the matrix that was
fed into the PCA. Each replicon is described by 378 floating-point values, one per
(arm, gap) bin.

**Shape:** one row per replicon × 379 columns (1 label + 378 values)

| Dimension | Values |
|---|---|
| Row | One replicon; first column = `ID-replicon` (row label, empty header) |
| Columns `0`–`377` | Flat arm×gap bin index (see matrix layout above); header = integer index |
| Cell value | HC score for that replicon at that (arm, gap) bin; `0.0` for absent bins |

---

### Population mean heatmap

**File format:** `hc_{taxon_value}_{part}_mean{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_mean_chromosome.csv`

**Data:** Mean HC score across all replicons for each (arm, gap) bin.

**Shape:** 21 rows × 19 columns (same layout as PC heatmap files)

| Dimension | Values |
|---|---|
| Rows | Gap values 0 → 20 (row label in first column) |
| Columns | Arm sizes 3 → 20 (column header = arm size integer); first col is row-label |
| Cell value | Mean HC score across all replicons for that bin (floating-point) |

---

### Population median heatmap

**File format:** `hc_{taxon_value}_{part}_median{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_median_chromosome.csv`

**Data:** Median HC score across all replicons for each (arm, gap) bin.  
Same shape and column layout as the mean file above.

---

### Population min / max heatmap

**File format:** `hc_{taxon_value}_{part}_min_max{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_min_max_chromosome.csv`

**Data:** The minimum and maximum HC score observed across all replicons
for each (arm, gap) bin. Each bin produces **two rows** (one `min`, one `max`).

**Shape:** up to 2 × 378 rows × 5 columns (only bins with ≥1 replicon are included)

**Columns:**

| Column | Description |
|---|---|
| `arm` | Arm size (3 → 20) |
| `gap` | Gap value (0 → 20) |
| `count` | Number of replicons that have data for this bin |
| `min_max` | `"min"` or `"max"` |
| `frequency` | The minimum or maximum HC score value for this bin |

---

### Pattern count heatmap

**File format:** `hc_{taxon_value}_{part}_pattern_count{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_pattern_count_chromosome.csv`

**Data:** For each replicon, the total number of IR occurrences (pattern instances)
found at each (arm, gap) bin. This is the denominator used to compute pattern ratios.

**Shape:** one row per replicon × 379 columns (1 label + 378 values)

| Dimension | Values |
|---|---|
| Row | One replicon; first column = `ID-replicon` |
| Columns `0`–`377` | Flat arm×gap bin index (header = integer index) |
| Cell value | Integer count of IR occurrences in this replicon at this bin; `0` for absent bins |

---

### Top-10 pattern heatmap

**File format:** `hc_{taxon_value}_{part}_pattern_top10{replicon_type}.csv`  
**Example:** `hc_Prokaryote_cod_pattern_top10_chromosome.csv`

**Data:** For each replicon and each (arm, gap) bin, the ten most frequent IR arm
sequences, together with their absolute occurrence counts.  
Counts represent the number of times that exact k-mer appears across all IR arms
of that length and gap in this replicon.

**Shape:** one row per replicon × 379 columns (1 label + 378 values)

| Dimension | Values |
|---|---|
| Row | One replicon; first column = `ID-replicon` |
| Columns `0`–`377` | Flat arm×gap bin index (header = integer index) |
| Cell value | Semicolon-separated `'pattern':count` pairs (see format below), or the sentinel `'0'` when no IRs exist for this bin |

**Cell format:**
```
'tata':240; 'atat':180; 'ttat':146; 'taga':138; 'atag':136; 'taag':134; 'tatt':102; 'ctat':97; 'agat':96; 'tcta':94
```
- Up to 10 entries per cell, sorted by descending count
- Pattern length = arm size for that column (`kmer = col + 3`, where `col = flat_index // 21`)
- Sentinel `'0'` indicates no IR data for this replicon at this bin (treated as blank, not zero)
- Counts are **absolute occurrences** of that k-mer across all IR sequences in this replicon for this bin 