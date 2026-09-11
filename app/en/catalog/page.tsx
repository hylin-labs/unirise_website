import {
  PublicCatalogRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';
import { localizedPageMetadata, metadataSearchFromParams } from '../../../lib/locale-seo';

export default function CatalogPage(props: PublicInnerRouteProps) {
  return PublicCatalogRoute({ ...props, locale: 'en' });
}

export async function generateMetadata({ searchParams }: PublicInnerRouteProps) {
  return localizedPageMetadata(
    'en',
    '/catalog',
    metadataSearchFromParams('/catalog', await searchParams),
  );
}
