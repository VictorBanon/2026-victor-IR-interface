function AbstractSection() {
  return (
    <section className="article-section" id="abstract">
      <div className="article-content">
        <h2>Objective</h2>
        <p>
          This interactive dashboard aims to analyze and classify inverted repeats (IRs) in bacterial genomes by examining 
          their structural properties. Our primary focus is on understanding the distribution patterns of IRs through data 
          mining techniques, categorizing them based on arm length and gap distance characteristics.
        </p>
        <p>
          By systematically analyzing these genomic features across thousands of prokaryotic organisms, we seek to uncover 
          evolutionary patterns, functional significance, and potential regulatory roles of inverted repeats. The data 
          exploration tools provided here enable researchers to filter, sort, and visualize IR distributions across different 
          taxonomic groups, replicon types (chromosomes vs. plasmids), and structural parameter ranges.
        </p>
      </div>
    </section>
  );
}

export default AbstractSection;
