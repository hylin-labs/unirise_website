import {
  PublicNewsRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';
import { localizedPageMetadata, metadataSearchFromParams } from '../../../lib/locale-seo';

export default function NewsPage(props: PublicInnerRouteProps) {
  return PublicNewsRoute({ ...props, locale: 'en' });
}

export async function generateMetadata({ searchParams }: PublicInnerRouteProps) {
  return localizedPageMetadata(
    'en',
    '/news',
    metadataSearchFromParams('/news', await searchParams),
  );
}
