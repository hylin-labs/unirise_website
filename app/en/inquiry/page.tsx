import {
  PublicInquiryRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';
import { localizedPageMetadata } from '../../../lib/locale-seo';

export const metadata = localizedPageMetadata('en', '/inquiry');

export default function InquiryPage(props: PublicInnerRouteProps) {
  return PublicInquiryRoute({ ...props, locale: 'en' });
}
