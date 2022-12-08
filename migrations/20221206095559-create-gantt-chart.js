'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('gantt_chart', {
      task_id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      uid: {
        type: Sequelize.STRING
      },
      project_uid: {
        type: Sequelize.STRING
      },
      row_number: {
        type: Sequelize.INTEGER,

      },
      task_title: {
        type: Sequelize.STRING
      },
      is_parent: {
        type: Sequelize.BOOLEAN
      },
      is_milestone: {
        type: Sequelize.BOOLEAN,

      },
      parent_id: {
        type: Sequelize.STRING
      },
      estimated_hour: {
        type: Sequelize.INTEGER
      },
      actual_hour: {
        type: Sequelize.INTEGER
      },
      task_type: {
        type: Sequelize.ENUM('work', 'rework', 'plan', 'spec change', 'external')
      },
      on_cp: {
        type: Sequelize.BOOLEAN
      },
      assignees: {
        type: Sequelize.TEXT
      },
      progress: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      completed: {
        type: Sequelize.BOOLEAN
      },
      start_date: {
        type: Sequelize.DATEONLY
      },
      end_date: {
        type: Sequelize.DATEONLY
      },
      snapshot_date: {
        type: Sequelize.DATEONLY
      },
      project_name: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP()'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP() ON UPDATE CURRENT_TIMESTAMP()'),
      }
    });
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
  }
};
