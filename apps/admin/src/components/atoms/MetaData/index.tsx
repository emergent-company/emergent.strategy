// Atom: MetaData
// Provides per-page <title> and optional noindex directive. Pure presentational head fragment.
export interface MetaDataProps {
  title?: string;
  noIndex?: boolean;
}

export function MetaData({ title, noIndex }: MetaDataProps) {
  return (
    <>
      <title>{`${title ? title + ' |' : ''} Emergent - Admin Dashboard`}</title>
      {noIndex && <meta name="robots" content="noindex" data-rh="true" />}
    </>
  );
}

export default MetaData;
