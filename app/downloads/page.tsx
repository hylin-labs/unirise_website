import {
  PublicDownloadsRoute,
  type PublicInnerRouteProps,
} from '../../components/public-inner-routes';
import { localizedPageMetadata, metadataSearchFromParams } from '../../lib/locale-seo';

export default function DownloadsPage(props: PublicInnerRouteProps) {
  return PublicDownloadsRoute({ ...props, locale: 'zh-TW' });
}

export async function generateMetadata({ searchParams }: PublicInnerRouteProps) {
  return localizedPageMetadata(
    'zh-TW',
    '/downloads',
    metadataSearchFromParams('/downloads', await searchParams),
  );
}
