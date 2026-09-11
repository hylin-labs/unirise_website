import {
  PublicCatalogRoute,
  type PublicInnerRouteProps,
} from '../../components/public-inner-routes';
import { localizedPageMetadata, metadataSearchFromParams } from '../../lib/locale-seo';

export default function CatalogPage(props: PublicInnerRouteProps) {
  return PublicCatalogRoute({ ...props, locale: 'zh-TW' });
}

export async function generateMetadata({ searchParams }: PublicInnerRouteProps) {
  return localizedPageMetadata(
    'zh-TW',
    '/catalog',
    metadataSearchFromParams('/catalog', await searchParams),
  );
}
