import {
  PublicDownloadsRoute,
  type PublicInnerRouteProps,
} from '../../../components/public-inner-routes';

export default function DownloadsPage(props: PublicInnerRouteProps) {
  return PublicDownloadsRoute({ ...props, locale: 'en' });
}
