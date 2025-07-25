import {Fragment} from 'react';

import {Alert} from 'sentry/components/core/alert';
import {Button} from 'sentry/components/core/button';
import {LinkButton} from 'sentry/components/core/button/linkButton';
import Form from 'sentry/components/deprecatedforms/form';
import FormState from 'sentry/components/forms/state';
import LoadingError from 'sentry/components/loadingError';
import LoadingIndicator from 'sentry/components/loadingIndicator';
import {t} from 'sentry/locale';
import PluginComponentBase from 'sentry/plugins/pluginComponentBase';
import GroupStore from 'sentry/stores/groupStore';
import type {Group} from 'sentry/types/group';
import type {Plugin} from 'sentry/types/integrations';
import type {Organization} from 'sentry/types/organization';
import type {Project} from 'sentry/types/project';
import {trackAnalytics} from 'sentry/utils/analytics';
import {getAnalyticsDataForGroup} from 'sentry/utils/events';

type Field = {
  depends?: string[];
  has_autocomplete?: boolean;
} & Parameters<typeof PluginComponentBase.prototype.renderField>[0]['config'];

type ActionType = 'link' | 'create' | 'unlink';
type FieldStateValue = (typeof FormState)[keyof typeof FormState];

type Props = {
  actionType: ActionType;
  group: Group;
  organization: Organization;
  plugin: Plugin & {
    issue?: {
      issue_id: string;
      label: string;
      url: string;
    };
  };
  project: Project;
  onError?: (data: any) => void;
  onSuccess?: (data: any) => void;
};

type State = {
  createFormData: Record<string, any>;
  dependentFieldState: Record<string, FieldStateValue>;
  linkFormData: Record<string, any>;
  unlinkFormData: Record<string, any>;
  createFieldList?: Field[];
  error?: {
    message: string;
    auth_url?: string;
    error_type?: string;
    errors?: Record<string, string>;
    has_auth_configured?: boolean;
    required_auth_settings?: string[];
  };
  linkFieldList?: Field[];
  loading?: boolean;
  unlinkFieldList?: Field[];
} & PluginComponentBase['state'];

class IssueActions extends PluginComponentBase<Props, State> {
  constructor(props: Props) {
    super(props);

    this.createIssue = this.onSave.bind(this, this.createIssue.bind(this));
    this.linkIssue = this.onSave.bind(this, this.linkIssue.bind(this));
    this.unlinkIssue = this.onSave.bind(this, this.unlinkIssue.bind(this));
    this.onSuccess = this.onSaveSuccess.bind(this, this.onSuccess.bind(this));
    this.errorHandler = this.onLoadError.bind(this, this.errorHandler.bind(this));

    this.state = {
      ...this.state,
      loading: ['link', 'create'].includes(this.props.actionType),
      state: ['link', 'create'].includes(this.props.actionType)
        ? FormState.LOADING
        : FormState.READY,
      createFormData: {},
      linkFormData: {},
      dependentFieldState: {},
    };
  }

  getGroup() {
    return this.props.group;
  }

  getProject() {
    return this.props.project;
  }

  getOrganization() {
    return this.props.organization;
  }

  getFieldListKey() {
    switch (this.props.actionType) {
      case 'link':
        return 'linkFieldList';
      case 'unlink':
        return 'unlinkFieldList';
      case 'create':
        return 'createFieldList';
      default:
        throw new Error('Unexpeced action type');
    }
  }

  getFormDataKey(actionType?: ActionType) {
    switch (actionType || this.props.actionType) {
      case 'link':
        return 'linkFormData';
      case 'unlink':
        return 'unlinkFormData';
      case 'create':
        return 'createFormData';
      default:
        throw new Error('Unexpeced action type');
    }
  }

  getFormData() {
    const key = this.getFormDataKey();
    return this.state[key] || {};
  }

  getFieldList() {
    const key = this.getFieldListKey();
    return this.state[key] || [];
  }

  componentDidMount() {
    const plugin = this.props.plugin;
    if (!plugin.issue && this.props.actionType !== 'unlink') {
      this.fetchData();
    }
  }

  getPluginCreateEndpoint() {
    return (
      '/issues/' + this.getGroup().id + '/plugins/' + this.props.plugin.slug + '/create/'
    );
  }

  getPluginLinkEndpoint() {
    return (
      '/issues/' + this.getGroup().id + '/plugins/' + this.props.plugin.slug + '/link/'
    );
  }

  getPluginUnlinkEndpoint() {
    return (
      '/issues/' + this.getGroup().id + '/plugins/' + this.props.plugin.slug + '/unlink/'
    );
  }

  setDependentFieldState(fieldName: any, state: any) {
    const dependentFieldState = {...this.state.dependentFieldState, [fieldName]: state};
    this.setState({dependentFieldState});
  }

  loadOptionsForDependentField = async (field: any) => {
    const formData = this.getFormData();

    const groupId = this.getGroup().id;
    const pluginSlug = this.props.plugin.slug;
    const url = `/issues/${groupId}/plugins/${pluginSlug}/options/`;

    // find the fields that this field is dependent on
    const dependentFormValues = Object.fromEntries(
      field.depends.map((fieldKey: any) => [fieldKey, formData[fieldKey]])
    );
    const query = {
      option_field: field.name,
      ...dependentFormValues,
    };
    try {
      this.setDependentFieldState(field.name, FormState.LOADING);
      const result = await this.api.requestPromise(url, {query});
      this.updateOptionsOfDependentField(field, result[field.name]);
      this.setDependentFieldState(field.name, FormState.READY);
    } catch (err) {
      this.setDependentFieldState(field.name, FormState.ERROR);
      this.errorHandler(err);
    }
  };

  updateOptionsOfDependentField = (field: Field, choices: Field['choices']) => {
    const formListKey = this.getFieldListKey();
    let fieldList = this.state[formListKey];
    if (!fieldList) {
      return;
    }

    // find the location of the field in our list and replace it
    const indexOfField = fieldList.findIndex(({name}) => name === field.name);
    field = {...field, choices};

    // make a copy of the array to avoid mutation
    fieldList = fieldList.slice();
    fieldList[indexOfField] = field;

    this.setState(prevState => ({...prevState, [formListKey]: fieldList}));
  };

  resetOptionsOfDependentField = (field: Field) => {
    this.updateOptionsOfDependentField(field, []);
    const formDataKey = this.getFormDataKey();
    const formData = {...this.state[formDataKey]};
    formData[field.name] = '';
    this.setState(prevState => ({...prevState, [formDataKey]: formData}));
    this.setDependentFieldState(field.name, FormState.DISABLED);
  };

  getInputProps(field: Field) {
    const props: {isLoading?: boolean; readonly?: boolean} = {};

    // special logic for fields that have dependencies
    if (field.depends && field.depends.length > 0) {
      switch (this.state.dependentFieldState[field.name]) {
        case FormState.LOADING:
          props.isLoading = true;
          props.readonly = true;
          break;
        case FormState.DISABLED:
        case FormState.ERROR:
          props.readonly = true;
          break;
        default:
          break;
      }
    }

    return props;
  }

  setError(error: any, defaultMessage: string) {
    let errorBody: any;
    if (error.status === 400 && error.responseJSON) {
      errorBody = error.responseJSON;
    } else {
      errorBody = {message: defaultMessage};
    }
    this.setState({error: errorBody});
  }

  errorHandler(error: any) {
    const state: Pick<State, 'loading' | 'error'> = {
      loading: false,
    };
    if (error.status === 400 && error.responseJSON) {
      state.error = error.responseJSON;
    } else {
      state.error = {message: t('An unknown error occurred.')};
    }
    this.setState(state);
  }

  onLoadSuccess() {
    super.onLoadSuccess();

    // dependent fields need to be set to disabled upon loading
    const fieldList = this.getFieldList();
    fieldList.forEach(field => {
      if (field.depends && field.depends.length > 0) {
        this.setDependentFieldState(field.name, FormState.DISABLED);
      }
    });
  }

  fetchData() {
    if (this.props.actionType === 'create') {
      this.api.request(this.getPluginCreateEndpoint(), {
        success: data => {
          const createFormData = {};
          data.forEach((field: any) => {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            createFormData[field.name] = field.default;
          });
          this.setState(
            {
              createFieldList: data,
              error: undefined,
              loading: false,
              createFormData,
            },
            this.onLoadSuccess
          );
        },
        error: this.errorHandler,
      });
    } else if (this.props.actionType === 'link') {
      this.api.request(this.getPluginLinkEndpoint(), {
        success: data => {
          const linkFormData = {};
          data.forEach((field: any) => {
            // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
            linkFormData[field.name] = field.default;
          });
          this.setState(
            {
              linkFieldList: data,
              error: undefined,
              loading: false,
              linkFormData,
            },
            this.onLoadSuccess
          );
        },
        error: this.errorHandler,
      });
    }
  }

  onSuccess(data: any) {
    // TODO(ts): This needs a better approach. We splice in this attribute to trigger
    // a refetch in GroupDetails
    type StaleGroup = Group & {stale?: boolean};

    trackAnalytics('issue_details.external_issue_created', {
      organization: this.props.organization,
      ...getAnalyticsDataForGroup(this.props.group),
      external_issue_provider: this.props.plugin.slug,
      external_issue_type: 'plugin',
    });

    GroupStore.onUpdateSuccess('', [this.getGroup().id], {stale: true} as StaleGroup);
    this.props.onSuccess?.(data);
  }

  createIssue() {
    this.api.request(this.getPluginCreateEndpoint(), {
      data: this.state.createFormData,
      success: this.onSuccess,
      error: this.onSaveError.bind(this, (error: any) => {
        this.setError(error, t('There was an error creating the issue.'));
      }),
      complete: this.onSaveComplete,
    });
  }

  linkIssue() {
    this.api.request(this.getPluginLinkEndpoint(), {
      data: this.state.linkFormData,
      success: this.onSuccess,
      error: this.onSaveError.bind(this, (error: any) => {
        this.setError(error, t('There was an error linking the issue.'));
      }),
      complete: this.onSaveComplete,
    });
  }

  unlinkIssue() {
    this.api.request(this.getPluginUnlinkEndpoint(), {
      success: this.onSuccess,
      error: this.onSaveError.bind(this, (error: any) => {
        this.setError(error, t('There was an error unlinking the issue.'));
      }),
      complete: this.onSaveComplete,
    });
  }

  changeField(action: ActionType, name: string, value: any) {
    const formDataKey = this.getFormDataKey(action);

    // copy so we don't mutate
    const formData = {...this.state[formDataKey]};
    const fieldList = this.getFieldList();

    formData[name] = value;

    let callback = () => {};

    // only works with one impacted field
    const impactedField = fieldList.find(({depends}) => {
      if (!depends?.length) {
        return false;
      }
      // must be dependent on the field we just set
      return depends.includes(name);
    });

    if (impactedField) {
      // if every dependent field is set, then search
      if (impactedField.depends?.some(dependentField => !formData[dependentField])) {
        // otherwise reset the options
        callback = () => this.resetOptionsOfDependentField(impactedField);
      } else {
        callback = () => this.loadOptionsForDependentField(impactedField);
      }
    }
    this.setState(prevState => ({...prevState, [formDataKey]: formData}), callback);
  }

  renderForm(): React.ReactNode {
    switch (this.props.actionType) {
      case 'create':
        if (this.state.createFieldList) {
          return (
            <Form
              onSubmit={this.createIssue}
              submitLabel={t('Create Issue')}
              footerClass=""
            >
              {this.state.createFieldList.map(field => {
                if (field.has_autocomplete) {
                  field = Object.assign(
                    {
                      url:
                        '/api/0/issues/' +
                        this.getGroup().id +
                        '/plugins/' +
                        this.props.plugin.slug +
                        '/autocomplete',
                    },
                    field
                  );
                }
                return (
                  <div key={field.name}>
                    {this.renderField({
                      config: {...field, ...this.getInputProps(field)},
                      formData: this.state.createFormData,
                      onChange: this.changeField.bind(this, 'create', field.name),
                    })}
                  </div>
                );
              })}
            </Form>
          );
        }
        break;
      case 'link':
        if (this.state.linkFieldList) {
          return (
            <Form onSubmit={this.linkIssue} submitLabel={t('Link Issue')} footerClass="">
              {this.state.linkFieldList.map(field => {
                if (field.has_autocomplete) {
                  field = Object.assign(
                    {
                      url:
                        '/api/0/issues/' +
                        this.getGroup().id +
                        '/plugins/' +
                        this.props.plugin.slug +
                        '/autocomplete',
                    },
                    field
                  );
                }
                return (
                  <div key={field.name}>
                    {this.renderField({
                      config: {...field, ...this.getInputProps(field)},
                      formData: this.state.linkFormData,
                      onChange: this.changeField.bind(this, 'link', field.name),
                    })}
                  </div>
                );
              })}
            </Form>
          );
        }
        break;
      case 'unlink':
        return (
          <div>
            <p>{t('Are you sure you want to unlink this issue?')}</p>
            <Button onClick={this.unlinkIssue} priority="danger">
              {t('Unlink Issue')}
            </Button>
          </div>
        );
      default:
        return null;
    }
    return null;
  }

  getPluginConfigureUrl() {
    const org = this.getOrganization();
    const project = this.getProject();
    const plugin = this.props.plugin;
    return '/' + org.slug + '/' + project.slug + '/settings/plugins/' + plugin.slug;
  }

  renderError() {
    const error = this.state.error;
    if (!error) {
      return null;
    }
    if (error.error_type === 'auth') {
      let authUrl = error.auth_url;
      if (authUrl?.indexOf('?') === -1) {
        authUrl += '?next=' + encodeURIComponent(document.location.pathname);
      } else {
        authUrl += '&next=' + encodeURIComponent(document.location.pathname);
      }
      return (
        <Fragment>
          <Alert.Container>
            <Alert type="info" showIcon={false}>
              {'You need to associate an identity with ' +
                this.props.plugin.name +
                ' before you can create issues with this service.'}
            </Alert>
          </Alert.Container>
          <LinkButton href={authUrl ?? '#'}>{t('Associate Identity')}</LinkButton>
        </Fragment>
      );
    }
    if (error.error_type === 'config') {
      return (
        <Alert type="info" showIcon={false}>
          {error.has_auth_configured ? (
            <Fragment>
              You still need to{' '}
              <a href={this.getPluginConfigureUrl()}>configure this plugin</a> before you
              can use it.
            </Fragment>
          ) : (
            <div>
              <p>
                {'Your server administrator will need to configure authentication with '}
                <strong>{this.props.plugin.name}</strong>
                {' before you can use this integration.'}
              </p>
              <p>The following settings must be configured:</p>
              <ul>
                {error.required_auth_settings?.map((setting, i) => (
                  <li key={i}>
                    <code>{setting}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Alert>
      );
    }
    if (error.error_type === 'validation') {
      const errors: React.ReactElement[] = [];
      for (const name in error.errors) {
        errors.push(<p key={name}>{error.errors[name]}</p>);
      }
      return (
        <Alert type="error" showIcon={false}>
          {errors}
        </Alert>
      );
    }
    if (error.message) {
      return (
        <Alert type="error" showIcon={false}>
          {error.message}
        </Alert>
      );
    }
    return <LoadingError />;
  }

  render() {
    if (this.state.state === FormState.LOADING) {
      return <LoadingIndicator />;
    }
    return (
      <div>
        {this.renderError()}
        {this.renderForm()}
      </div>
    );
  }
}

export default IssueActions;
