import React from 'react';

import {mountWithTheme} from 'sentry-test/enzyme';

import NarrowLayout from 'app/components/narrowLayout';

describe('NarrowLayout', function () {
  beforeAll(function () {
    jest.spyOn(window.location, 'assign').mockImplementation(() => {});
  });
  afterAll(function () {
    window.location.assign.mockRestore();
  });

  it('renders without logout', function () {
    const wrapper = mountWithTheme(<NarrowLayout />);
    expect(wrapper.find('a.logout')).toHaveLength(0);
  });

  it('renders with logout', function () {
    const wrapper = mountWithTheme(<NarrowLayout showLogout />);
    expect(wrapper.find('a.logout')).toHaveLength(1);
  });

  it('can logout', function () {
    const mock = MockApiClient.addMockResponse({
      url: '/auth/',
      method: 'DELETE',
      status: 204,
    });
    const wrapper = mountWithTheme(<NarrowLayout showLogout />);

    wrapper.find('a.logout').simulate('click');
    expect(mock).toHaveBeenCalled();
  });
});
