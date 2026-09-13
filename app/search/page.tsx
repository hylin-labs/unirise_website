import {
  PublicSearchRoute,
  type PublicInnerRouteProps,
} from '../../components/public-inner-routes';
import { localizedPageMetadata } from '../../lib/locale-seo';

export default function SearchPage(props: PublicInnerRouteProps) {
  return PublicSearchRoute({ ...props, locale: 'zh-TW' });
}

export async function generateMetadata() {
  return localizedPageMetadata('zh-TW', '/search');
}
