import {
  PublicInquiryRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';

export default function InquiryPage(props: PublicInnerRouteProps) {
  return PublicInquiryRoute({ ...props, locale: 'en' });
}
