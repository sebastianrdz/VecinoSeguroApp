import React from 'react';
import { Text } from 'react-native';

import ScreenContainer from '../../components/ScreenContainer';
import { t } from '../../i18n';
import { typography } from '../../theme/tokens';

export default function PrivacyNoticeScreen() {
  return (
    <ScreenContainer scroll>
      <Text style={typography.body}>{t('privacy.body')}</Text>
    </ScreenContainer>
  );
}
