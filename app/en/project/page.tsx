import {
  PublicProjectPassportRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';
import { localizedPageMetadata } from '../../../lib/locale-seo';

export const metadata = localizedPageMetadata('en', '/project');

export default function EnglishProjectPage(props: PublicInnerRouteProps) {
  return PublicProjectPassportRoute({ ...props, locale: 'en' });
}
