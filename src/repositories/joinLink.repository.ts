import JoinLink, { type IJoinLink } from '../models/joinLink.model.js';

export const create = (
    data: Pick<IJoinLink, 'createdBy' | 'createdByUsername' | 'configuration'>,
) => JoinLink.create(data);

export const findById = (id: string) => JoinLink.findById(id);

export const findByOrganization = (organizationName: string) =>
    JoinLink.find({ 'configuration.organization.value.name': organizationName }).sort({
        createdAt: -1,
    });
