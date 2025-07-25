import {Alert} from 'sentry/components/core/alert';
import {ExternalLink} from 'sentry/components/core/link';
import {tct} from 'sentry/locale';

export default function widgetCallout({link}: {link: string}) {
  return (
    <Alert.Container>
      <Alert type="info">
        {tct(
          `Want to receive user feedback at any time, not just when an error happens? [link:Read the docs] to learn how to set up our customizable widget.`,
          {
            link: <ExternalLink href={link} />,
          }
        )}
      </Alert>
    </Alert.Container>
  );
}
