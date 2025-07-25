import {Fragment, useRef, useState} from 'react';
import moment from 'moment-timezone';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'spri... Remove this comment to see the full error message
import {sprintf} from 'sprintf-js';

import type {ModalRenderProps} from 'sentry/actionCreators/modal';
import {Alert} from 'sentry/components/core/alert';
import {Button} from 'sentry/components/core/button';
import {ButtonBar} from 'sentry/components/core/button/buttonBar';
import {Input} from 'sentry/components/core/input';
import {t} from 'sentry/locale';
import type {IgnoredStatusDetails} from 'sentry/types/group';

type Props = ModalRenderProps & {
  onSelected: (details: IgnoredStatusDetails) => void;
};

export default function CustomIgnoreDurationModal(props: Props) {
  const [dateWarning, setDateWarning] = useState<boolean>(false);
  const {Header, Body, Footer, onSelected, closeModal} = props;

  const snoozeDateInputRef = useRef<HTMLInputElement>(null);

  const snoozeTimeInputRef = useRef<HTMLInputElement | null>(null);

  const selectedIgnoreMinutes = () => {
    const dateStr = snoozeDateInputRef.current?.value; // YYYY-MM-DD
    const timeStr = snoozeTimeInputRef.current?.value; // HH:MM
    if (dateStr && timeStr) {
      const selectedDate = moment.utc(dateStr + ' ' + timeStr);
      if (selectedDate.isValid()) {
        const now = moment.utc();
        return selectedDate.diff(now, 'minutes');
      }
    }
    return 0;
  };

  const snoozeClicked = () => {
    const minutes = selectedIgnoreMinutes();

    if (minutes <= 0) {
      setDateWarning(minutes <= 0);
      return;
    }

    onSelected({ignoreDuration: minutes});
    closeModal();
  };

  // Give the user a sane starting point to select a date
  // (prettier than the empty date/time inputs):
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 14);
  defaultDate.setSeconds(0);
  defaultDate.setMilliseconds(0);

  const defaultDateVal = sprintf(
    '%d-%02d-%02d',
    defaultDate.getUTCFullYear(),
    defaultDate.getUTCMonth() + 1,
    defaultDate.getUTCDate()
  );

  const defaultTimeVal = sprintf('%02d:00', defaultDate.getUTCHours());

  return (
    <Fragment>
      <Header>
        <h4>{t('Archive this issue until\u2026')}</h4>
      </Header>
      <Body>
        <form className="form-horizontal">
          <div className="control-group">
            <h6 className="nav-header">{t('Date')}</h6>
            <Input
              className="form-control"
              type="date"
              id="snooze-until-date"
              defaultValue={defaultDateVal}
              ref={snoozeDateInputRef}
              required
              style={{padding: '0 10px'}}
            />
          </div>
          <div className="control-group m-b-1">
            <h6 className="nav-header">{t('Time (UTC)')}</h6>
            <Input
              className="form-control"
              type="time"
              id="snooze-until-time"
              defaultValue={defaultTimeVal}
              ref={snoozeTimeInputRef}
              style={{padding: '0 10px'}}
              required
            />
          </div>
        </form>
      </Body>
      {dateWarning && (
        <Alert.Container>
          <Alert type="error">{t('Please enter a valid date in the future')}</Alert>
        </Alert.Container>
      )}
      <Footer>
        <ButtonBar>
          <Button priority="default" onClick={closeModal}>
            {t('Cancel')}
          </Button>
          <Button priority="primary" onClick={snoozeClicked}>
            {t('Archive')}
          </Button>
        </ButtonBar>
      </Footer>
    </Fragment>
  );
}
